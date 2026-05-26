import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/cormorant-garamond/latin-400.css";
import "@fontsource/cormorant-garamond/latin-500.css";
import "@fontsource/cormorant-garamond/latin-600.css";
import "@fontsource/cormorant-garamond/latin-700.css";
import "@fontsource/great-vibes/latin-400.css";
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { CheckCircle2, Download, Flower2, Grid3X3, List, Loader2, Lock, Pencil, RefreshCcw, Sparkles, Trash2, TriangleAlert, UserRound, Users } from "lucide-react";
import minimal2BotanicalUrl from "./assets/minimal2-botanical.svg";
import { initAnalytics, trackEvent, trackMetaStandard } from "./analytics.js";
import "./styles.css";

const gumroadUrl = import.meta.env.VITE_GUMROAD_URL || "https://chartplan.gumroad.com/l/hgdfr";
const stateVersion = 11;

const tableNames = Array.from({ length: 40 }, (_, index) => `Table ${index + 1}`);
const templates = ["Minimal", "Minimal 2"];
const tablesPerPageByTemplate = {
  Minimal: 9,
  "Minimal 2": 6
};

function makeId(prefix = "id") {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function makeGuest(name, group = "", notes = "", tags = []) {
  return { id: makeId("guest"), name: name.trim(), group, notes, tags };
}

function createTables(count, seats, names = []) {
  return Array.from({ length: count }, (_, index) => ({
    id: makeId("table"),
    name: names[index] || `Table ${index + 1}`,
    capacity: seats,
    guestIds: []
  }));
}

function localParse(input) {
  let group = "";
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      if (/[:：]$/.test(line)) {
        group = line.replace(/[:：]$/, "");
        return [];
      }
      if (/do not|don't|avoid|not seat/i.test(line)) return [];
      return line
        .split(/,|;|\+|&|\band\b/i)
        .map((name) => name.replace(/\([^)]*\)/g, "").replace(/[-–].*$/, "").trim())
        .filter((name) => name.length > 1)
        .map((name) => makeGuest(name, group));
    });
}

function loadState() {
  try {
    const saved = localStorage.getItem("seatflow-state");
    const parsed = saved ? JSON.parse(saved) : null;
    if (!parsed) return null;
    if (parsed.stateVersion === stateVersion) return { ...parsed, template: templates.includes(parsed.template) ? parsed.template : templates[0] };
    if (parsed.stateVersion >= 8 && parsed.stateVersion < stateVersion) {
      const template = parsed.template === "Elegant Pink" ? "Minimal" : parsed.template;
      return { ...parsed, stateVersion, template: templates.includes(template) ? template : templates[0], eventDate: parsed.eventDate || "" };
    }
    return null;
  } catch {
    return null;
  }
}

function DraggableGuest({ guest, compact = false }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: guest.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  return (
    <div
      ref={setNodeRef}
      className={`guest-pill ${compact ? "compact" : ""} ${isDragging ? "dragging" : ""}`}
      style={style}
      title={guest.notes || guest.group || guest.name}
    >
      <button className="drag-handle" type="button" aria-label={`Drag ${guest.name}`} {...listeners} {...attributes}>
        <span className="grip">::</span>
      </button>
      <span className="guest-name">{guest.name}</span>
      <GuestIcon tags={guest.tags} />
    </div>
  );
}
function GuestIcon({ tags = [] }) {
  if (tags.includes("heart")) return <span className="guest-icon heart">♥</span>;
  if (tags.includes("music")) return <span className="guest-icon music">♣</span>;
  if (tags.includes("star")) return <span className="guest-icon star">★</span>;
  if (tags.includes("leaf")) return <span className="guest-icon leaf">☘</span>;
  if (tags.includes("note")) return <span className="guest-icon note">▣</span>;
  return null;
}

function DropZone({ id, children, className = "" }) {
  const { isOver, setNodeRef } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`${className} ${isOver ? "is-over" : ""}`}>
      {children}
    </div>
  );
}

function App() {
  const saved = loadState();
  const [rawInput, setRawInput] = useState(saved?.rawInput || "");
  const [guests, setGuests] = useState(saved?.guests || []);
  const [tables, setTables] = useState(saved?.tables || createTables(8, 8, tableNames));
  const [constraints, setConstraints] = useState(saved?.constraints || []);
  const [tableCount, setTableCount] = useState(saved?.tableCount || 8);
  const [seatsPerTable, setSeatsPerTable] = useState(saved?.seatsPerTable || 8);
  const [draftTableCount, setDraftTableCount] = useState(saved?.tableCount || 8);
  const [draftSeatsPerTable, setDraftSeatsPerTable] = useState(saved?.seatsPerTable || 8);
  const [chartTitle, setChartTitle] = useState(saved?.chartTitle || "");
  const [eventDate, setEventDate] = useState(saved?.eventDate || "");
  const [template, setTemplate] = useState(saved?.template || templates[0]);
  const [activeGuestId, setActiveGuestId] = useState(null);
  const [isParsing, setIsParsing] = useState(false);
  const [importReport, setImportReport] = useState(saved?.importReport || { source: "demo", notes: [], groups: [], constraints: [], suggestedTables: [], warning: "" });
  const [showPaywall, setShowPaywall] = useState(false);
  const [guestModalOpen, setGuestModalOpen] = useState(false);
  const [newGuestName, setNewGuestName] = useState("");
  const [capacityModal, setCapacityModal] = useState(null);
  const [capacityDraft, setCapacityDraft] = useState("");
  const [moveGuestId, setMoveGuestId] = useState(null);
  const [viewMode, setViewMode] = useState("grid");
  const [isExporting, setIsExporting] = useState(false);
  const [unlocked, setUnlocked] = useState(() => localStorage.getItem("seatflow-unlocked") === "true");
  const [showOnboarding, setShowOnboarding] = useState(() => !saved?.onboardingComplete);
  const previewRef = useRef(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 80, tolerance: 10 } })
  );

  useEffect(() => {
    initAnalytics();
    trackEvent("app_loaded");
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("paid") === "true" || params.get("license") === "success") {
      localStorage.setItem("seatflow-unlocked", "true");
      setUnlocked(true);
      trackEvent("payment_returned", { source: "gumroad" });
      trackEvent("purchase", { source: "gumroad", value: 17, currency: "USD" });
      trackMetaStandard("Purchase", { value: 17, currency: "USD" });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("seatflow-state", JSON.stringify({ stateVersion, rawInput, guests, tables, constraints, tableCount, seatsPerTable, template, importReport, chartTitle, eventDate, onboardingComplete: !showOnboarding }));
  }, [rawInput, guests, tables, constraints, tableCount, seatsPerTable, template, importReport, chartTitle, eventDate, showOnboarding]);

  const seatedIds = useMemo(() => new Set(tables.flatMap((table) => table.guestIds)), [tables]);
  const guestMap = useMemo(() => new Map(guests.map((guest) => [guest.id, guest])), [guests]);
  const unseatedGuests = guests.filter((guest) => !seatedIds.has(guest.id));
  const activeGuest = activeGuestId ? guestMap.get(activeGuestId) : null;
  const seatedCount = guests.length - unseatedGuests.length;
  const groupCount = importReport.groups?.length || new Set(guests.map((guest) => guest.group).filter(Boolean)).size || 0;
  const noteCount = importReport.notes?.length || guests.filter((guest) => guest.notes || guest.tags?.length).length || 0;
  const fullTables = tables.filter((table) => table.guestIds.length >= table.capacity).length;
  const overCapacity = tables.filter((table) => table.guestIds.length > table.capacity).length;
  const setupDirty = draftTableCount !== tableCount || draftSeatsPerTable !== seatsPerTable;
  const reviewNotes = useMemo(() => {
    const items = [
      ...(importReport.notes || []),
      ...guests.flatMap((guest) => {
        const details = [];
        if (guest.notes) details.push(`${guest.name}: ${guest.notes}`);
        if (guest.tags?.length) details.push(`${guest.name}: ${guest.tags.join(", ")}`);
        return details;
      })
    ];
    return [...new Set(items.map((item) => String(item).trim()).filter(Boolean))].slice(0, 10);
  }, [guests, importReport.notes]);

  async function parseWithAi(options = {}) {
    const nextTableCount = options.tableCount ?? tableCount;
    const nextSeatsPerTable = options.seatsPerTable ?? seatsPerTable;
    if (!rawInput.trim()) {
      setGuests([]);
      setConstraints([]);
      setTables(createTables(nextTableCount, nextSeatsPerTable, tableNames));
      setImportReport({ source: "blank", notes: [], groups: [], constraints: [], suggestedTables: [], warning: "" });
      trackEvent("guest_import_skipped_blank", { table_count: nextTableCount, seats_per_table: nextSeatsPerTable });
      return;
    }
    setIsParsing(true);
    trackEvent("guest_import_started", { input_length: rawInput.length, table_count: nextTableCount, seats_per_table: nextSeatsPerTable });
    try {
      const response = await fetch("/api/parse-guests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: rawInput })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not parse guest list.");
      const parsedGuests = data.guests?.length ? data.guests.map((guest) => ({ ...guest, id: makeId("guest") })) : localParse(rawInput);
      setGuests(parsedGuests);
      setConstraints(data.constraints || []);
      const suggestedTables = data.suggestedTables || [];
      const nextTables = createTables(nextTableCount, nextSeatsPerTable, tableNames);
      nextTables.forEach((table, index) => {
        const suggested = suggestedTables[index];
        if (suggested?.guests?.length > table.capacity) table.capacity = suggested.guests.length;
      });
      setTables(nextTables);
      setImportReport({
        source: data.source || "local",
        notes: data.notes || [],
        groups: data.groups || [],
        constraints: data.constraints || [],
        suggestedTables: data.suggestedTables || [],
        warning: data.warning || ""
      });
      trackEvent("guest_import_completed", {
        source: data.source || "local",
        guest_count: parsedGuests.length,
        group_count: data.groups?.length || 0,
        constraint_count: data.constraints?.length || 0
      });
    } catch {
      setGuests(localParse(rawInput));
      setConstraints([]);
      setTables(createTables(nextTableCount, nextSeatsPerTable, tableNames));
      setImportReport({ source: "local", notes: [], groups: [], constraints: [], suggestedTables: [], warning: "Import used local parsing." });
      trackEvent("guest_import_failed", { fallback: true });
    } finally {
      setIsParsing(false);
    }
  }

  async function startFromOnboarding() {
    setTableCount(draftTableCount);
    setSeatsPerTable(draftSeatsPerTable);
    setShowOnboarding(false);
    trackEvent("onboarding_completed", { table_count: draftTableCount, seats_per_table: draftSeatsPerTable, has_guest_list: Boolean(rawInput.trim()) });
    await parseWithAi({ tableCount: draftTableCount, seatsPerTable: draftSeatsPerTable });
  }

  function moveGuest(guestId, overId) {
    setTables((current) => {
      const cleaned = current.map((table) => ({ ...table, guestIds: table.guestIds.filter((id) => id !== guestId) }));
      if (overId === "unseated") return cleaned;
      return cleaned.map((table) => (table.id === overId ? { ...table, guestIds: [...table.guestIds, guestId] } : table));
    });
  }

  function quickMoveGuest(guestId, destinationId) {
    moveGuest(guestId, destinationId);
    setMoveGuestId(null);
    trackEvent("mobile_guest_moved", { destination: destinationId === "unseated" ? "unseated" : "table" });
  }

  function autoSeat() {
    const empty = createTables(tableCount, seatsPerTable, tableNames);
    const placed = new Set();
    const byName = new Map(guests.map((guest) => [guest.name.toLowerCase(), guest]));

    let usedSuggestedSlots = 0;
    (importReport.suggestedTables || []).forEach((suggested, index) => {
      const suggestedName = String(suggested.name || "").toLowerCase();
      const table = empty[index] || empty.find((item) => item.name.toLowerCase() === suggestedName);
      if (!table) return;
      if (suggested.guests?.length > table.capacity) table.capacity = suggested.guests.length;
      const beforeCount = table.guestIds.length;
      suggested.guests.forEach((name) => {
        const guest = byName.get(String(name).toLowerCase());
        if (guest && !placed.has(guest.id) && table.guestIds.length < table.capacity) {
          table.guestIds.push(guest.id);
          placed.add(guest.id);
        }
      });
      if (table.guestIds.length > beforeCount) usedSuggestedSlots += 1;
    });

    let tableIndex = Math.min(usedSuggestedSlots, empty.length - 1);
    guests.filter((guest) => !placed.has(guest.id)).forEach((guest) => {
      while (empty[tableIndex] && empty[tableIndex].guestIds.length >= empty[tableIndex].capacity) tableIndex += 1;
      if (empty[tableIndex]) empty[tableIndex].guestIds.push(guest.id);
    });
    setTables(empty);
    trackEvent("auto_seat_clicked", { guest_count: guests.length, table_count: tableCount });
  }

  function removeGuest(guestId) {
    setGuests((current) => current.filter((guest) => guest.id !== guestId));
    setTables((current) => current.map((table) => ({ ...table, guestIds: table.guestIds.filter((id) => id !== guestId) })));
  }

  function addGuestFromModal() {
    const name = newGuestName.replace(/\s+/g, " ").trim();
    if (!name) return;
    setGuests((current) => [...current, makeGuest(name)]);
    setNewGuestName("");
    setGuestModalOpen(false);
    trackEvent("manual_guest_added");
  }

  function sortUnseated() {
    const unseatedSet = new Set(unseatedGuests.map((guest) => guest.id));
    const sorted = [...unseatedGuests].sort((a, b) => a.name.localeCompare(b.name));
    setGuests((current) => [...current.filter((guest) => !unseatedSet.has(guest.id)), ...sorted]);
  }

  function clearSeating() {
    setTables((current) => current.map((table) => ({ ...table, guestIds: [] })));
  }

  function updateTableCount(nextCount) {
    setDraftTableCount(nextCount);
  }

  function updateSeatsPerTable(nextSeats) {
    setDraftSeatsPerTable(nextSeats);
  }

  function applyTableSetup() {
    setTableCount(draftTableCount);
    setSeatsPerTable(draftSeatsPerTable);
    setTables((current) => {
      const next = createTables(draftTableCount, draftSeatsPerTable, tableNames);
      current.slice(0, draftTableCount).forEach((table, index) => {
        next[index] = { ...next[index], id: table.id, name: table.name, capacity: draftSeatsPerTable, guestIds: table.guestIds };
      });
      return next;
    });
    trackEvent("table_setup_updated", { table_count: draftTableCount, seats_per_table: draftSeatsPerTable });
  }

  function editTableCapacity(tableId) {
    const table = tables.find((item) => item.id === tableId);
    if (!table) return;
    setCapacityDraft(String(table.capacity));
    setCapacityModal(table);
  }

  function saveTableCapacity() {
    const capacity = Math.max(1, Math.min(40, Number(capacityDraft)));
    if (!Number.isFinite(capacity)) return;
    setTables((current) => current.map((item) => (item.id === capacityModal.id ? { ...item, capacity } : item)));
    setCapacityModal(null);
    setCapacityDraft("");
    trackEvent("single_table_capacity_updated", { capacity });
  }

  async function exportPdf() {
    if (!unlocked) {
      setShowPaywall(true);
      trackEvent("paywall_opened", { guest_count: guests.length, seated_count: seatedCount, table_count: tables.length });
      trackMetaStandard("AddToCart", { value: 17, currency: "USD" });
      return;
    }
    setIsExporting(true);
    try {
      await printPreviewPdf(previewRef.current, chartTitle);
      trackEvent("pdf_downloaded", { guest_count: guests.length, table_count: tables.length });
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="app">
      {showOnboarding ? (
        <Onboarding
          chartTitle={chartTitle}
          setChartTitle={setChartTitle}
          rawInput={rawInput}
          setRawInput={setRawInput}
          tableCount={draftTableCount}
          setTableCount={updateTableCount}
          seatsPerTable={draftSeatsPerTable}
          setSeatsPerTable={updateSeatsPerTable}
          isParsing={isParsing}
          onStart={startFromOnboarding}
        />
      ) : null}
      <main className="workspace">
        <aside className="left-rail">
          <div className="brand"><Flower2 size={37} /><strong>SeatFlow</strong></div>
          <label className="section-title">Paste guest list</label>
          <textarea value={rawInput} onChange={(event) => setRawInput(event.target.value)} spellCheck="false" />
          <div className="char-count">{rawInput.length} / 2000</div>
          <button className="organize-button" type="button" onClick={parseWithAi} disabled={isParsing}>
            {isParsing ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
            Organize guest list
          </button>

          <div className="summary-card">
            <div className="summary-head">
              <strong>Summary</strong>
              <button type="button" onClick={parseWithAi}><RefreshCcw size={13} /> Refresh</button>
            </div>
            <MetricLine icon={Users} label="Guests" value={guests.length} />
            <MetricLine icon={Users} label="Groups" value={groupCount} />
            <MetricLine icon={List} label="Notes" value={noteCount} />
            <MetricLine icon={TriangleAlert} label="Constraints" value={constraints.length} />
            <div className={`import-source ${importReport.source !== "local" ? "ok" : ""}`}>
              {importReport.warning ? "Review import" : "Import ready"}
            </div>
            {importReport.warning ? <div className="import-warning">{importReport.warning}</div> : null}
          </div>

          <div className="setup-card">
            <h3>Table setup</h3>
            <div className="setup-grid">
              <label>Tables <Stepper value={draftTableCount} setValue={updateTableCount} min={1} max={40} /></label>
              <label>Seats per table <Stepper value={draftSeatsPerTable} setValue={updateSeatsPerTable} min={1} max={20} /></label>
            </div>
            {setupDirty ? (
              <button className="update-setup-button" type="button" onClick={applyTableSetup}>
                Update table setup
              </button>
            ) : null}
          </div>

          <button className="auto-button" type="button" onClick={autoSeat}><Sparkles size={18} /> Auto-seat guests</button>
          <button className="clear-button" type="button" onClick={clearSeating}>Clear seating</button>
        </aside>

        <DndContext
          sensors={sensors}
          onDragStart={(event) => setActiveGuestId(event.active.id)}
          onDragEnd={(event) => {
            if (event.over?.id) moveGuest(event.active.id, event.over.id);
            setActiveGuestId(null);
          }}
          onDragCancel={() => setActiveGuestId(null)}
        >
          <section className="planner">
            <div className="stat-grid">
              <StatCard icon={Users} label="Total guests" value={guests.length} tone="green" />
              <StatCard icon={CheckCircle2} label="Seated guests" value={seatedCount} tone="green" />
              <StatCard icon={UserRound} label="Unseated guests" value={unseatedGuests.length} tone="gold" />
              <StatCard icon={TriangleAlert} label="Full tables / Over capacity" value={`${fullTables} / ${overCapacity}`} tone="red" />
            </div>

            <DropZone id="unseated" className="unseated">
              <div className="section-row">
                <div><h2>Unseated guests</h2><span>Drag guests to any table</span></div>
                <div className="section-actions">
                  <button className="add-guest-button" type="button" onClick={() => setGuestModalOpen(true)}>+</button>
                  <button className="sort-button" type="button" onClick={sortUnseated}>Sort</button>
                </div>
              </div>
              <div className="guest-list">
                {unseatedGuests.map((guest) => (
                  <div className="guest-line" key={guest.id}>
                    <DraggableGuest guest={guest} />
                    <button className="move-guest-button" type="button" onClick={() => setMoveGuestId(guest.id)}>Seat</button>
                    <button className="icon-button" type="button" onClick={() => removeGuest(guest.id)} title="Remove guest"><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            </DropZone>

            {(reviewNotes.length || constraints.length) ? (
              <section className="review-panel">
                {reviewNotes.length ? (
                  <div>
                    <h3>Notes</h3>
                    <ul>{reviewNotes.map((note) => <li key={note}>{note}</li>)}</ul>
                  </div>
                ) : null}
                {constraints.length ? (
                  <div>
                    <h3>Seating rules</h3>
                    <ul>
                      {constraints.slice(0, 10).map((constraint, index) => (
                        <li key={`${constraint.type}-${index}`}>{formatConstraint(constraint)}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>
            ) : null}

            <section className="tables-section">
              <div className="section-row">
                <div><h2>Tables</h2><span>Drag guests between tables</span></div>
                <div className="view-toggle">
                  <span>View</span>
                  <button className={viewMode === "grid" ? "selected" : ""} type="button" onClick={() => setViewMode("grid")} title="Grid view"><Grid3X3 size={15} /></button>
                  <button className={viewMode === "list" ? "selected" : ""} type="button" onClick={() => setViewMode("list")} title="List view"><List size={15} /></button>
                </div>
              </div>
              <div className={`tables-grid ${viewMode === "list" ? "list-view" : ""}`}>
                {tables.map((table) => {
                  const over = table.guestIds.length > table.capacity;
                  return (
                    <DropZone id={table.id} className={`table-card ${over ? "over" : ""}`} key={table.id}>
                      <div className="table-top">
                        <div className="table-name-control">
                          <input value={table.name} onChange={(event) => setTables((current) => current.map((item) => (item.id === table.id ? { ...item, name: event.target.value } : item)))} />
                          <button type="button" onClick={(event) => event.currentTarget.previousElementSibling?.focus()} title="Rename table">
                            <Pencil size={11} />
                          </button>
                        </div>
                        <div className="capacity-control">
                          <span>{table.guestIds.length} / {table.capacity}</span>
                          <button type="button" onClick={() => editTableCapacity(table.id)} title="Change seats for this table">
                            <Pencil size={12} />
                          </button>
                        </div>
                      </div>
                      <div className="seated-list">
                        {table.guestIds.map((guestId) => {
                          const guest = guestMap.get(guestId);
                          return guest ? (
                            <div className="seated-guest-row" key={guest.id}>
                              <DraggableGuest guest={guest} compact />
                              <button className="move-guest-button compact" type="button" onClick={() => setMoveGuestId(guest.id)}>Move</button>
                            </div>
                          ) : null;
                        })}
                        {!table.guestIds.length ? <em>Drop guest</em> : null}
                      </div>
                      <div className="flourish">⌁ ❦ ⌁</div>
                    </DropZone>
                  );
                })}
              </div>
            </section>
          </section>
          <DragOverlay>{activeGuest ? <div className="guest-pill overlay"><span className="guest-name">{activeGuest.name}</span></div> : null}</DragOverlay>
        </DndContext>

        <aside className="right-rail">
          <div className="preview-heading"><h2>Preview</h2></div>
          <label className="template-label title-label">Couple or event name</label>
          <input className="chart-title-input" value={chartTitle} onChange={(event) => setChartTitle(event.target.value)} />
          {template === "Minimal 2" ? (
            <>
              <label className="template-label title-label">Event date</label>
              <input className="chart-title-input" value={eventDate} onChange={(event) => setEventDate(event.target.value)} placeholder="12.05.2028" />
            </>
          ) : null}
          <PrintableChart refEl={previewRef} template={template} tables={tables} guestMap={guestMap} chartTitle={chartTitle} eventDate={eventDate} />
          <label className="template-label">Choose template</label>
          <div className="template-tabs">
            {templates.map((item) => (
              <button className={template === item ? "selected" : ""} key={item} type="button" onClick={() => setTemplate(item)}>
                <span>{template === item ? "✓" : ""}</span>{item}
              </button>
            ))}
          </div>
          <button className="download-outline" type="button" onClick={exportPdf} disabled={isExporting}>
            {isExporting ? <Loader2 className="spin" size={17} /> : <Download size={17} />}
            Download printable PDF
          </button>
          <div className="trust-row"><Lock size={13} /> Secure payment <span>•</span> 7-day money-back guarantee</div>
        </aside>
      </main>

      {showPaywall ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="paywall">
            <button className="modal-close" type="button" onClick={() => setShowPaywall(false)}>x</button>
            <div className="modal-icon"><Download size={24} /></div>
            <h2>Download your printable PDF</h2>
            <p>Your seating chart is ready. Pay once to download the finished PDF for printing, sharing, or sending to your venue.</p>
            <a className="gold-cta pay-button" href={gumroadUrl} onClick={() => { trackEvent("gumroad_checkout_clicked", { guest_count: guests.length, seated_count: seatedCount, table_count: tables.length, value: 17, currency: "USD" }); trackMetaStandard("InitiateCheckout", { value: 17, currency: "USD" }); }}>Download for $17</a>
          </div>
        </div>
      ) : null}

      {guestModalOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="mini-modal">
            <button className="modal-close" type="button" onClick={() => setGuestModalOpen(false)}>x</button>
            <h2>Add guest</h2>
            <p>Add one person to your unseated list.</p>
            <input value={newGuestName} onChange={(event) => setNewGuestName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addGuestFromModal(); }} autoFocus placeholder="Guest name" />
            <button className="gold-cta" type="button" onClick={addGuestFromModal}>Add to unseated guests</button>
          </div>
        </div>
      ) : null}

      {capacityModal ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="mini-modal">
            <button className="modal-close" type="button" onClick={() => setCapacityModal(null)}>x</button>
            <h2>Seats at {capacityModal.name}</h2>
            <p>Change capacity for this table only.</p>
            <input value={capacityDraft} onChange={(event) => setCapacityDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") saveTableCapacity(); }} autoFocus inputMode="numeric" />
            <button className="gold-cta" type="button" onClick={saveTableCapacity}>Update seats</button>
          </div>
        </div>
      ) : null}

      {moveGuestId ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="mini-modal move-modal">
            <button className="modal-close" type="button" onClick={() => setMoveGuestId(null)}>x</button>
            <h2>Seat {guestMap.get(moveGuestId)?.name}</h2>
            <p>Choose a table. This is easier on mobile than dragging.</p>
            <div className="move-options">
              <button type="button" onClick={() => quickMoveGuest(moveGuestId, "unseated")}>Unseated guests</button>
              {tables.map((table) => (
                <button className={table.guestIds.length >= table.capacity ? "full" : ""} type="button" key={table.id} onClick={() => quickMoveGuest(moveGuestId, table.id)}>
                  <span>{table.name}</span>
                  <strong>{table.guestIds.length} / {table.capacity}</strong>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stepper({ value, setValue, min, max }) {
  return (
    <div className="stepper">
      <button type="button" onClick={() => setValue(Math.max(min, value - 1))}>−</button>
      <strong>{value}</strong>
      <button type="button" onClick={() => setValue(Math.min(max, value + 1))}>＋</button>
    </div>
  );
}

function MetricLine({ icon: Icon, label, value }) {
  return <div className="metric-line"><Icon size={17} /><span>{label}</span><strong>{value}</strong></div>;
}

function StatCard({ icon: Icon, label, value, tone }) {
  return <div className={`stat-card ${tone}`}><Icon size={25} /><div><span>{label}</span><strong>{value}</strong></div></div>;
}

function formatConstraint(constraint) {
  const people = constraint.people?.filter(Boolean).join(", ");
  const label = {
    avoid: "Avoid",
    keepTogether: "Keep together",
    seatNear: "Seat near",
    specialNeed: "Special need",
    dietary: "Dietary",
    accessibility: "Accessibility"
  }[constraint.type] || "Rule";
  return `${label}${people ? `: ${people}` : ""}${constraint.note ? ` - ${constraint.note}` : ""}`;
}

function Onboarding({ chartTitle, setChartTitle, rawInput, setRawInput, tableCount, setTableCount, seatsPerTable, setSeatsPerTable, isParsing, onStart }) {
  const previewTables = useMemo(() => createTables(6, 8, tableNames), []);
  const previewGuestMap = useMemo(() => new Map(), []);
  const titleReady = Boolean(chartTitle.trim());

  return (
    <div className="onboarding-screen" role="dialog" aria-modal="true">
      <div className="onboarding-shell">
        <section className="onboarding-copy">
          <div className="brand onboarding-brand"><Flower2 size={37} /><strong>SeatFlow</strong></div>
          <p className="onboarding-kicker">Printable wedding seating chart</p>
          <h1>Turn a messy guest list into a beautiful seating chart.</h1>
          <p className="onboarding-subcopy">Paste names, choose your table setup, then drag guests until it feels right. Build for free. Pay only when you download the finished PDF.</p>
          <div className="onboarding-preview-card">
            <PrintableChart refEl={null} tables={previewTables} guestMap={previewGuestMap} chartTitle={chartTitle} />
          </div>
        </section>

        <section className="onboarding-panel">
          <div className="onboarding-step">
            <span>1</span>
            <div>
              <label>Couple or event name</label>
              <input value={chartTitle} onChange={(event) => setChartTitle(event.target.value)} placeholder="Couple or event name" required />
              {!titleReady ? <small className="field-hint">Required for the printable chart.</small> : null}
            </div>
          </div>

          <div className="onboarding-step">
            <span>2</span>
            <div>
              <label>Paste your guest list</label>
              <textarea value={rawInput} onChange={(event) => setRawInput(event.target.value)} spellCheck="false" />
            </div>
          </div>

          <div className="onboarding-step">
            <span>3</span>
            <div>
              <label>Table setup</label>
              <div className="onboarding-setup">
                <div>
                  <small>Tables</small>
                  <Stepper value={tableCount} setValue={setTableCount} min={1} max={40} />
                </div>
                <div>
                  <small>Seats per table</small>
                  <Stepper value={seatsPerTable} setValue={setSeatsPerTable} min={1} max={20} />
                </div>
              </div>
            </div>
          </div>

          <button className="onboarding-start" type="button" onClick={onStart} disabled={isParsing || !titleReady}>
            {isParsing ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
            Start seating chart
          </button>
        </section>
      </div>
    </div>
  );
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

async function printPreviewPdf(previewNode, chartTitle) {
  if (!previewNode) throw new Error("Preview is not ready.");
  await document.fonts?.ready;
  await Promise.allSettled([
    document.fonts?.load('400 120px "Abramo Script"'),
    document.fonts?.load('400 18px "29LT Zarid Display"'),
    document.fonts?.load('400 128px "Kudryashev Display"')
  ].filter(Boolean));
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const printFrame = document.createElement("iframe");
  printFrame.className = "pdf-print-frame";
  printFrame.setAttribute("aria-hidden", "true");
  document.body.appendChild(printFrame);

  const printDocument = printFrame.contentDocument;
  if (!printDocument) {
    printFrame.remove();
    throw new Error("Could not prepare the PDF preview.");
  }

  const styles = [...document.querySelectorAll('link[rel="stylesheet"], style')].map((node) => node.outerHTML).join("\n");
  const title = pdfDocumentTitle(chartTitle);
  const previewClone = previewNode.cloneNode(true);

  printDocument.open();
  printDocument.write(`<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <base href="${window.location.origin}${window.location.pathname}" />
        <title>${escapeHtml(title)}</title>
        ${styles}
      </head>
      <body class="pdf-print-body">
        ${previewClone.outerHTML}
      </body>
    </html>`);
  printDocument.close();

  await waitForPrintDocument(printFrame);
  printFrame.contentWindow?.focus();
  printFrame.contentWindow?.print();
  setTimeout(() => printFrame.remove(), 1000);
}

function pdfDocumentTitle(chartTitle) {
  const coupleName = chartTitle.trim().replace(/\s+/g, " ");
  return `${coupleName || "Wedding"} Seating Plan`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

async function waitForPrintDocument(printFrame) {
  const printDocument = printFrame.contentDocument;
  if (!printDocument) return;
  if (printDocument.readyState !== "complete") {
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 3000);
      printFrame.addEventListener("load", resolve, { once: true });
      printFrame.addEventListener("load", () => clearTimeout(timeout), { once: true });
    });
  }
  await printDocument.fonts?.ready;
  const images = [...printDocument.images];
  await Promise.allSettled(images.map((image) => {
    if (image.complete) return Promise.resolve();
    if (image.decode) return image.decode();
    return new Promise((resolve) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", resolve, { once: true });
    });
  }));
  await new Promise((resolve) => printFrame.contentWindow?.requestAnimationFrame(() => printFrame.contentWindow?.requestAnimationFrame(resolve)));
}

function tableGuestNames(table, guestMap) {
  return table.guestIds.map((guestId) => guestMap.get(guestId)?.name).filter(Boolean);
}

function guestListDensity(count) {
  if (count <= 6) return "normal";
  if (count <= 9) return "dense";
  if (count <= 12) return "compact";
  return "tiny";
}

function splitChartTitle(title) {
  const cleanTitle = title.trim();
  if (!cleanTitle) return { first: "", second: "" };
  const parts = cleanTitle.split(/\s+(?:&|and)\s+/i).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) return { first: parts[0], second: parts.slice(1).join(" & ") };
  return { first: cleanTitle, second: "" };
}

function nameSizeFor(titlePart) {
  const length = [...titlePart].length;
  if (length <= 7) return 15.96;
  return Math.max(6.9, Math.min(15.96, 102 / length));
}

function weddingLabel(chartTitle) {
  const names = previewTitle(chartTitle).replace(/\s*&\s*/g, " AND ").replace(/\s+/g, " ").toUpperCase();
  return names ? `THE ${names} WEDDING` : "THE WEDDING";
}

function previewTitle(chartTitle) {
  return chartTitle.trim() || "Emma & Daniel";
}

function PrintableChart({ refEl, tables, guestMap, chartTitle, eventDate = "", template = "Minimal" }) {
  const tablesPerPage = tablesPerPageByTemplate[template] || tablesPerPageByTemplate.Minimal;
  const pages = chunk(tables, tablesPerPage);
  if (template === "Minimal 2") {
    return <Minimal2Chart refEl={refEl} pages={pages} guestMap={guestMap} chartTitle={chartTitle} eventDate={eventDate} tablesPerPage={tablesPerPage} />;
  }
  return <MinimalChart refEl={refEl} pages={pages} guestMap={guestMap} chartTitle={chartTitle} tablesPerPage={tablesPerPage} />;
}

function MinimalChart({ refEl, pages, guestMap, chartTitle, tablesPerPage }) {
  const displayTitle = previewTitle(chartTitle);
  const { first, second } = splitChartTitle(displayTitle);
  const firstNameSize = nameSizeFor(first);
  const secondNameSize = second ? nameSizeFor(second) : firstNameSize;

  return (
    <div className="html-template-preview" ref={refEl}>
      {pages.map((pageTables, pageIndex) => (
        <main className="template-page" aria-label="Seating plan" key={`page-${pageIndex}`}>
          <section className={`figma-couple-block ${second ? "" : "single-name"}`} aria-label={displayTitle}>
            <div className="figma-name-frame figma-name-frame-first" style={{ "--name-size": `${firstNameSize}cqw` }}>
              <p>{first}</p>
            </div>
            {second ? (
              <div className="figma-amp-frame">
                <p>&</p>
              </div>
            ) : null}
            {second ? (
              <div className="figma-name-frame figma-name-frame-second" style={{ "--name-size": `${secondNameSize}cqw` }}>
                <p>{second}</p>
              </div>
            ) : null}
          </section>
          <h2 className="figma-plan-title">SEATING PLAN</h2>

          <section className="template-table-grid">
            {pageTables.map((table, index) => {
              const guests = tableGuestNames(table, guestMap);
              const tableNumber = pageIndex * tablesPerPage + index + 1;
              return (
                <article className="table-group" key={table.id}>
                  <div className="table-heading">
                    <span className={`table-number ${tableNumber > 9 ? "multi-digit" : ""}`}>{tableNumber}</span>
                  </div>
                  <ul className={`guest-list ${guestListDensity(guests.length)}`}>
                    {guests.map((name) => <li key={`${table.id}-${name}`}>{name}</li>)}
                  </ul>
                </article>
              );
            })}
          </section>
        </main>
      ))}
    </div>
  );
}

function Minimal2Chart({ refEl, pages, guestMap, chartTitle, eventDate, tablesPerPage }) {
  const displayDate = eventDate.trim() || "12.05.2028";
  return (
    <div className="html-template-preview" ref={refEl}>
      {pages.map((pageTables, pageIndex) => (
        <main className="template-page template-page-minimal2" aria-label="Minimal 2 seating plan" key={`minimal2-page-${pageIndex}`}>
          <img className="minimal2-botanical" src={minimal2BotanicalUrl} alt="" />
          <section className="minimal2-meta">
            <p>{displayDate}</p>
            <p>{weddingLabel(chartTitle)}</p>
          </section>
          <h2 className="minimal2-title"><span>SEATING</span><span>PLAN</span></h2>
          <section className="minimal2-table-grid">
            <span className="minimal2-divider divider-one" />
            <span className="minimal2-divider divider-two" />
            <span className="minimal2-divider divider-three" />
            {pageTables.map((table, index) => {
              const guests = tableGuestNames(table, guestMap);
              const tableNumber = pageIndex * tablesPerPage + index + 1;
              return (
                <article className="minimal2-table-group" key={table.id}>
                  <h3>TABLE {tableNumber}</h3>
                  <ul className={`minimal2-guest-list ${guestListDensity(guests.length)}`}>
                    {guests.map((name) => <li key={`${table.id}-${name}`}>{name}</li>)}
                  </ul>
                </article>
              );
            })}
          </section>
        </main>
      ))}
    </div>
  );
}

const rootElement = document.getElementById("root");
const root = window.__seatflowRoot || createRoot(rootElement);
window.__seatflowRoot = root;
root.render(<App />);
