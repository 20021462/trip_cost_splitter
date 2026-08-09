import { useState, useEffect, useMemo } from "react";
import {
  Plus, Trash2, Users, Receipt, ArrowRight, X, Plane, Wallet, Check, ChevronLeft, ChevronRight,
} from "lucide-react";

const STORAGE_KEY = "trip-ledger:data";

const FONT_IMPORT = `
@import url('https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@600;700;800&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap');
`;

const uid = () => Math.random().toString(36).slice(2, 10);
const money = (n) => (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);

function simplifyDebts(balances) {
  const creditors = balances.filter((b) => b.net > 0.005).map((b) => ({ ...b })).sort((a, b) => b.net - a.net);
  const debtors = balances.filter((b) => b.net < -0.005).map((b) => ({ ...b })).sort((a, b) => a.net - b.net);
  const transfers = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount = Math.min(-debtor.net, creditor.net);
    if (amount > 0.005) {
      transfers.push({ from: debtor.name, to: creditor.name, amount });
      debtor.net += amount;
      creditor.net -= amount;
    }
    if (Math.abs(debtor.net) < 0.01) i++;
    if (Math.abs(creditor.net) < 0.01) j++;
  }
  return transfers;
}

function tripBalances(trip, peopleById) {
  const map = {};
  (trip.participantIds || []).forEach((id) => {
    if (peopleById[id]) map[id] = { id, name: peopleById[id].name, paid: 0, owes: 0 };
  });
  (trip.receipts || []).forEach((r) => {
    if (map[r.paidBy]) map[r.paidBy].paid += r.amount;
    if (r.splitType === "equal") {
      const share = r.amount / r.participants.length;
      r.participants.forEach((pid) => {
        if (map[pid]) map[pid].owes += share;
      });
    } else {
      Object.entries(r.customSplits || {}).forEach(([pid, amt]) => {
        if (map[pid]) map[pid].owes += amt;
      });
    }
  });
  return Object.values(map).map((p) => ({ ...p, net: p.paid - p.owes }));
}

export default function TripLedgerApp() {
  const [loaded, setLoaded] = useState(false);
  const [people, setPeople] = useState([]);
  const [trips, setTrips] = useState([]);
  const [view, setView] = useState("home"); // home | people | trip
  const [activeTripId, setActiveTripId] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY, false);
        if (res && res.value) {
          const data = JSON.parse(res.value);
          setPeople(data.people || []);
          setTrips(data.trips || []);
        }
      } catch (e) {
        // nothing saved yet
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    window.storage.set(STORAGE_KEY, JSON.stringify({ people, trips }), false).catch(() => {});
  }, [people, trips, loaded]);

  const peopleById = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p])), [people]);

  const globalNet = useMemo(() => {
    const net = Object.fromEntries(people.map((p) => [p.id, 0]));
    trips.forEach((trip) => {
      tripBalances(trip, peopleById).forEach((b) => {
        net[b.id] = (net[b.id] || 0) + b.net;
      });
    });
    return net;
  }, [people, trips, peopleById]);

  function addTrip(name) {
    const trip = { id: uid(), name: name || "Untitled Trip", participantIds: [], receipts: [] };
    setTrips((t) => [trip, ...t]);
    return trip.id;
  }

  function removeTrip(id) {
    setTrips((t) => t.filter((x) => x.id !== id));
  }

  function updateTrip(id, updater) {
    setTrips((ts) => ts.map((t) => (t.id === id ? updater(t) : t)));
  }

  function addGlobalPerson(name) {
    const p = { id: uid(), name };
    setPeople((ps) => [...ps, p]);
    return p.id;
  }

  function removeGlobalPerson(id) {
    setPeople((ps) => ps.filter((p) => p.id !== id));
    setTrips((ts) =>
      ts.map((t) => ({
        ...t,
        participantIds: t.participantIds.filter((pid) => pid !== id),
        receipts: t.receipts
          .filter((r) => r.paidBy !== id)
          .map((r) => ({
            ...r,
            participants: r.participants.filter((pid) => pid !== id),
            customSplits: r.customSplits
              ? Object.fromEntries(Object.entries(r.customSplits).filter(([pid]) => pid !== id))
              : undefined,
          })),
      }))
    );
  }

  const activeTrip = trips.find((t) => t.id === activeTripId);

  return (
    <div style={{ fontFamily: "'IBM Plex Sans', sans-serif" }} className="w-full min-h-full bg-[#ECE7DA] text-[#1C2B39]">
      <style>{FONT_IMPORT}</style>
      <div className="max-w-md mx-auto px-4 pt-6 pb-10">
        <TopNav view={view} setView={setView} onBack={view === "trip" ? () => setView("home") : null} />

        {view === "home" && (
          <HomeScreen
            trips={trips}
            peopleById={peopleById}
            addTrip={addTrip}
            removeTrip={removeTrip}
            openTrip={(id) => {
              setActiveTripId(id);
              setView("trip");
            }}
          />
        )}

        {view === "people" && (
          <PeopleScreen people={people} globalNet={globalNet} addGlobalPerson={addGlobalPerson} removeGlobalPerson={removeGlobalPerson} />
        )}

        {view === "trip" && activeTrip && (
          <TripScreen
            trip={activeTrip}
            people={people}
            peopleById={peopleById}
            addGlobalPerson={addGlobalPerson}
            updateTrip={(updater) => updateTrip(activeTrip.id, updater)}
          />
        )}
      </div>
    </div>
  );
}

function TopNav({ view, setView, onBack }) {
  return (
    <div className="flex items-center justify-between mb-5">
      <div className="flex items-center gap-2">
        {onBack ? (
          <button onClick={onBack} className="flex items-center gap-1 text-sm font-semibold text-[#1F5C56]">
            <ChevronLeft size={18} /> Trips
          </button>
        ) : (
          <div className="flex items-center gap-2 text-[#1F5C56]">
            <Plane size={18} strokeWidth={2.5} />
            <span style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontSize: "1.4rem", fontWeight: 700 }}>
              Trip Ledger
            </span>
          </div>
        )}
      </div>
      {view !== "trip" && (
        <div className="flex bg-white rounded-full border border-[#1C2B39]/10 p-0.5">
          {[
            { id: "home", label: "Trips", icon: Plane },
            { id: "people", label: "People", icon: Users },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold ${
                view === id ? "bg-[#1F5C56] text-[#ECE7DA]" : "text-[#1C2B39]/50"
              }`}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function HomeScreen({ trips, peopleById, addTrip, removeTrip, openTrip }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  function submit() {
    const id = addTrip(name.trim() || "Untitled Trip");
    setName("");
    setAdding(false);
    openTrip(id);
  }

  return (
    <div className="space-y-3">
      {trips.length === 0 && !adding && (
        <p className="text-sm text-[#1C2B39]/60 italic px-1">No trips yet. Start one below.</p>
      )}

      {trips.map((trip) => {
        const total = trip.receipts.reduce((s, r) => s + r.amount, 0);
        return (
          <div key={trip.id} className="bg-white rounded-lg border border-[#1C2B39]/10 overflow-hidden">
            <button onClick={() => openTrip(trip.id)} className="w-full text-left px-4 py-3 flex items-center justify-between">
              <div>
                <div style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontSize: "1.3rem", fontWeight: 700 }}>
                  {trip.name}
                </div>
                <div className="text-xs text-[#1C2B39]/50 mt-0.5">
                  {trip.participantIds.length} pax · {trip.receipts.length} receipts
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="font-mono text-sm font-semibold text-[#1F5C56]">${money(total)}</div>
                <ChevronRight size={16} className="text-[#1C2B39]/30" />
              </div>
            </button>
            <div className="flex justify-end px-4 pb-2">
              <button onClick={() => removeTrip(trip.id)} className="text-[#B23A2E]/60 hover:text-[#B23A2E] text-xs flex items-center gap-1">
                <Trash2 size={12} /> Delete trip
              </button>
            </div>
          </div>
        );
      })}

      {adding ? (
        <div className="flex gap-2 bg-white rounded-lg p-3 border border-[#1C2B39]/10">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Trip name"
            className="flex-1 outline-none bg-transparent border-b border-[#1C2B39]/20 px-1 py-1"
          />
          <button onClick={submit} className="px-3 py-1 rounded bg-[#1F5C56] text-[#ECE7DA] text-sm font-semibold">
            <Check size={16} />
          </button>
          <button onClick={() => setAdding(false)} className="px-2 text-[#1C2B39]/50">
            <X size={16} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border-2 border-dashed border-[#1C2B39]/25 text-[#1C2B39]/60 hover:border-[#1F5C56] hover:text-[#1F5C56] font-medium text-sm"
        >
          <Plus size={16} /> New trip
        </button>
      )}
    </div>
  );
}

function PeopleScreen({ people, globalNet, addGlobalPerson, removeGlobalPerson }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  function submit() {
    if (!name.trim()) return;
    addGlobalPerson(name.trim());
    setName("");
    setAdding(false);
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[#1C2B39]/50 px-1">Balance shown is net across every trip this person is part of.</p>

      {people.length === 0 && !adding && <p className="text-sm text-[#1C2B39]/60 italic px-1">No one in the directory yet.</p>}

      {people.map((p) => {
        const net = globalNet[p.id] || 0;
        return (
          <div key={p.id} className="flex items-center justify-between bg-white rounded-lg px-4 py-3 border border-[#1C2B39]/10">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#1F5C56] text-[#ECE7DA] flex items-center justify-center font-mono text-sm font-semibold">
                {p.name.slice(0, 1).toUpperCase()}
              </div>
              <span className="font-medium">{p.name}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm font-semibold" style={{ color: net >= 0 ? "#3F6B4F" : "#B23A2E" }}>
                {Math.abs(net) < 0.005 ? "settled" : `${net >= 0 ? "+" : "-"}$${money(Math.abs(net))}`}
              </span>
              <button onClick={() => removeGlobalPerson(p.id)} className="text-[#B23A2E]/70 hover:text-[#B23A2E]">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        );
      })}

      {adding ? (
        <div className="flex gap-2 bg-white rounded-lg p-3 border border-[#1C2B39]/10">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Name"
            className="flex-1 outline-none bg-transparent border-b border-[#1C2B39]/20 px-1 py-1"
          />
          <button onClick={submit} className="px-3 py-1 rounded bg-[#1F5C56] text-[#ECE7DA] text-sm font-semibold">
            <Check size={16} />
          </button>
          <button onClick={() => setAdding(false)} className="px-2 text-[#1C2B39]/50">
            <X size={16} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border-2 border-dashed border-[#1C2B39]/25 text-[#1C2B39]/60 hover:border-[#1F5C56] hover:text-[#1F5C56] font-medium text-sm"
        >
          <Plus size={16} /> Add person
        </button>
      )}
    </div>
  );
}

function TripScreen({ trip, people, peopleById, addGlobalPerson, updateTrip }) {
  const [tab, setTab] = useState("people");

  const total = trip.receipts.reduce((s, r) => s + r.amount, 0);
  const balances = useMemo(() => tripBalances(trip, peopleById), [trip, peopleById]);
  const transfers = useMemo(() => simplifyDebts(balances), [balances]);

  function setName(name) {
    updateTrip((t) => ({ ...t, name }));
  }
  function addParticipant(id) {
    updateTrip((t) => (t.participantIds.includes(id) ? t : { ...t, participantIds: [...t.participantIds, id] }));
  }
  function removeParticipant(id) {
    updateTrip((t) => ({
      ...t,
      participantIds: t.participantIds.filter((pid) => pid !== id),
      receipts: t.receipts
        .filter((r) => r.paidBy !== id)
        .map((r) => ({
          ...r,
          participants: r.participants.filter((pid) => pid !== id),
          customSplits: r.customSplits ? Object.fromEntries(Object.entries(r.customSplits).filter(([pid]) => pid !== id)) : undefined,
        })),
    }));
  }
  function setReceipts(updaterOrArray) {
    updateTrip((t) => ({
      ...t,
      receipts: typeof updaterOrArray === "function" ? updaterOrArray(t.receipts) : updaterOrArray,
    }));
  }

  const [editingName, setEditingName] = useState(false);
  const tripPeople = trip.participantIds.map((id) => peopleById[id]).filter(Boolean);

  return (
    <div>
      <div className="bg-[#1F5C56] text-[#ECE7DA] rounded-t-xl px-5 pt-5 pb-6 relative overflow-hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#C89B3C] text-xs tracking-[0.2em] uppercase font-semibold">
            <Plane size={14} strokeWidth={2.5} />
            Trip Ledger
          </div>
          <div className="text-[10px] tracking-[0.15em] uppercase opacity-70 font-mono">{tripPeople.length} pax</div>
        </div>

        {editingName ? (
          <input
            autoFocus
            value={trip.name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setEditingName(false)}
            onKeyDown={(e) => e.key === "Enter" && setEditingName(false)}
            className="mt-2 bg-transparent border-b border-[#C89B3C] outline-none w-full"
            style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontSize: "2.1rem", fontWeight: 700 }}
          />
        ) : (
          <h1
            onClick={() => setEditingName(true)}
            className="mt-2 leading-none cursor-text"
            style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontSize: "2.1rem", fontWeight: 700 }}
          >
            {trip.name}
          </h1>
        )}

        <div className="mt-4 flex items-end justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.15em] opacity-70">Total spent</div>
            <div className="font-mono text-2xl font-semibold text-[#C89B3C]">${money(total)}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.15em] opacity-70">Receipts</div>
            <div className="font-mono text-2xl font-semibold">{trip.receipts.length}</div>
          </div>
        </div>
      </div>

      <div className="relative h-0">
        <div className="absolute -left-4 -right-4 flex justify-between px-1" style={{ top: "-9px" }}>
          {Array.from({ length: 18 }).map((_, i) => (
            <div key={i} className="w-[9px] h-[9px] rounded-full bg-[#ECE7DA]" />
          ))}
        </div>
      </div>
      <div className="border-t border-dashed border-[#1C2B39]/30" />

      <div className="grid grid-cols-3 bg-white/60 rounded-b-lg overflow-hidden mb-5 border border-[#1C2B39]/10 border-t-0">
        {[
          { id: "people", label: "People", icon: Users },
          { id: "receipts", label: "Receipts", icon: Receipt },
          { id: "settle", label: "Settle Up", icon: Wallet },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex flex-col items-center gap-1 py-3 text-xs font-semibold uppercase tracking-wide transition-colors ${
              tab === id ? "bg-[#1F5C56] text-[#ECE7DA]" : "text-[#1C2B39]/60 hover:bg-[#1C2B39]/5"
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {tab === "people" && (
        <TripPeopleTab
          people={people}
          tripPeople={tripPeople}
          addParticipant={addParticipant}
          removeParticipant={removeParticipant}
          addGlobalPerson={addGlobalPerson}
        />
      )}

      {tab === "receipts" && (
        <ReceiptsTab people={tripPeople} receipts={trip.receipts} setReceipts={setReceipts} />
      )}

      {tab === "settle" && (
        <div className="space-y-5 pb-4">
          <div className="space-y-2">
            {balances.map((b) => (
              <div key={b.id} className="flex items-center justify-between bg-white rounded-lg px-4 py-3 border border-[#1C2B39]/10">
                <span className="font-medium">{b.name}</span>
                <span className="font-mono text-sm font-semibold" style={{ color: b.net >= 0 ? "#3F6B4F" : "#B23A2E" }}>
                  {b.net >= 0 ? "+" : "-"}${money(Math.abs(b.net))}
                </span>
              </div>
            ))}
            {balances.length === 0 && <p className="text-sm text-[#1C2B39]/60 italic px-1">Add people and receipts to see balances.</p>}
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-[0.15em] text-[#1C2B39]/50 font-semibold mb-2 px-1">
              Settle with {transfers.length} transfer{transfers.length === 1 ? "" : "s"}
            </div>
            <div className="space-y-2">
              {transfers.map((t, i) => (
                <div key={i} className="flex items-center gap-3 bg-white rounded-lg px-4 py-3 border border-[#1C2B39]/10">
                  <span className="font-medium flex-1 text-right">{t.from}</span>
                  <div className="flex flex-col items-center text-[#C89B3C]">
                    <ArrowRight size={16} />
                    <span className="font-mono text-xs font-semibold">${money(t.amount)}</span>
                  </div>
                  <span className="font-medium flex-1">{t.to}</span>
                </div>
              ))}
              {transfers.length === 0 && balances.length > 0 && (
                <p className="text-sm text-[#1C2B39]/60 italic px-1">Everyone's square. Nothing to settle.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TripPeopleTab({ people, tripPeople, addParticipant, removeParticipant, addGlobalPerson }) {
  const [showPicker, setShowPicker] = useState(false);
  const [newName, setNewName] = useState("");
  const notInTrip = people.filter((p) => !tripPeople.some((tp) => tp.id === p.id));

  function createAndAdd() {
    if (!newName.trim()) return;
    const id = addGlobalPerson(newName.trim());
    addParticipant(id);
    setNewName("");
  }

  return (
    <div className="space-y-2 pb-4">
      {tripPeople.length === 0 && <p className="text-sm text-[#1C2B39]/60 italic px-1">No one added to this trip yet.</p>}
      {tripPeople.map((p) => (
        <div key={p.id} className="flex items-center justify-between bg-white rounded-lg px-4 py-3 border border-[#1C2B39]/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#1F5C56] text-[#ECE7DA] flex items-center justify-center font-mono text-sm font-semibold">
              {p.name.slice(0, 1).toUpperCase()}
            </div>
            <span className="font-medium">{p.name}</span>
          </div>
          <button onClick={() => removeParticipant(p.id)} className="text-[#B23A2E]/70 hover:text-[#B23A2E]">
            <Trash2 size={16} />
          </button>
        </div>
      ))}

      {showPicker ? (
        <div className="bg-white rounded-lg border border-[#1C2B39]/10 p-3 space-y-2">
          {notInTrip.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {notInTrip.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addParticipant(p.id)}
                  className="text-xs px-2.5 py-1 rounded-full border border-[#1C2B39]/15 text-[#1C2B39]/70 hover:border-[#1F5C56] hover:text-[#1F5C56] font-medium"
                >
                  + {p.name}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createAndAdd()}
              placeholder="New person"
              className="flex-1 outline-none bg-transparent border-b border-[#1C2B39]/20 px-1 py-1 text-sm"
            />
            <button onClick={createAndAdd} className="px-3 py-1 rounded bg-[#1F5C56] text-[#ECE7DA] text-sm font-semibold">
              <Check size={16} />
            </button>
            <button onClick={() => setShowPicker(false)} className="px-2 text-[#1C2B39]/50">
              <X size={16} />
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowPicker(true)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border-2 border-dashed border-[#1C2B39]/25 text-[#1C2B39]/60 hover:border-[#1F5C56] hover:text-[#1F5C56] font-medium text-sm"
        >
          <Plus size={16} /> Add from directory
        </button>
      )}
    </div>
  );
}

function ReceiptsTab({ people, receipts, setReceipts }) {
  const [showReceiptForm, setShowReceiptForm] = useState(false);
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState(people[0]?.id || "");
  const [splitType, setSplitType] = useState("equal");
  const [participants, setParticipants] = useState(people.map((p) => p.id));
  const [customSplits, setCustomSplits] = useState({});

  useEffect(() => {
    if (people.length && !paidBy) setPaidBy(people[0].id);
    setParticipants((prev) => (prev.length ? prev.filter((id) => people.some((p) => p.id === id)) : people.map((p) => p.id)));
  }, [people]);

  function toggleParticipant(id) {
    setParticipants((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const customTotal = Object.values(customSplits).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const amt = parseFloat(amount) || 0;
  const customValid = splitType !== "custom" || Math.abs(customTotal - amt) < 0.01;

  function resetForm() {
    setDesc("");
    setAmount("");
    setSplitType("equal");
    setParticipants(people.map((p) => p.id));
    setCustomSplits({});
  }

  function addReceipt() {
    if (!desc.trim() || !amt || !paidBy) return;
    if (splitType === "equal" && participants.length === 0) return;
    if (splitType === "custom" && !customValid) return;

    const receipt = {
      id: uid(),
      description: desc.trim(),
      amount: amt,
      paidBy,
      splitType,
      participants: splitType === "equal" ? participants : Object.keys(customSplits).filter((id) => (parseFloat(customSplits[id]) || 0) > 0),
      customSplits: splitType === "custom" ? Object.fromEntries(Object.entries(customSplits).map(([k, v]) => [k, parseFloat(v) || 0])) : undefined,
    };
    setReceipts((rs) => [receipt, ...rs]);
    resetForm();
    setShowReceiptForm(false);
  }

  function removeReceipt(id) {
    setReceipts((rs) => rs.filter((r) => r.id !== id));
  }

  const nameOf = (id) => people.find((p) => p.id === id)?.name || "?";

  return (
    <div className="space-y-3 pb-4">
      {receipts.length === 0 && !showReceiptForm && (
        <p className="text-sm text-[#1C2B39]/60 italic px-1">No receipts yet. Log the first spend of the trip.</p>
      )}

      {receipts.map((r) => (
        <div key={r.id} className="bg-white rounded-lg border border-[#1C2B39]/10 overflow-hidden relative">
          <div className="flex items-start justify-between px-4 pt-3">
            <div>
              <div className="font-medium">{r.description}</div>
              <div className="text-xs text-[#1C2B39]/50 mt-0.5">
                Paid by <span className="font-semibold text-[#1C2B39]/70">{nameOf(r.paidBy)}</span> ·{" "}
                {r.splitType === "equal" ? `split ${r.participants.length} ways` : "custom split"}
              </div>
            </div>
            <div className="font-mono font-semibold text-[#1F5C56]">${money(r.amount)}</div>
          </div>
          <div className="flex items-center justify-between px-4 pb-3 pt-2">
            <div className="flex flex-wrap gap-1">
              {(r.splitType === "equal" ? r.participants : Object.keys(r.customSplits || {})).map((pid) => (
                <span key={pid} className="text-[10px] font-mono bg-[#ECE7DA] rounded px-1.5 py-0.5 text-[#1C2B39]/70">
                  {nameOf(pid)}
                </span>
              ))}
            </div>
            <button onClick={() => removeReceipt(r.id)} className="text-[#B23A2E]/60 hover:text-[#B23A2E]">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ))}

      {people.length === 0 ? (
        <p className="text-sm text-[#1C2B39]/50 italic px-1">Add people to this trip first before logging receipts.</p>
      ) : showReceiptForm ? (
        <div className="bg-white rounded-lg border border-[#1C2B39]/10 p-4 space-y-3">
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="What was it for?"
            className="w-full outline-none border-b border-[#1C2B39]/20 py-1.5 bg-transparent"
          />
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[10px] uppercase tracking-wide text-[#1C2B39]/50">Amount</label>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                inputMode="decimal"
                className="w-full outline-none border-b border-[#1C2B39]/20 py-1.5 bg-transparent font-mono"
              />
            </div>
            <div className="flex-1">
              <label className="text-[10px] uppercase tracking-wide text-[#1C2B39]/50">Paid by</label>
              <select
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value)}
                className="w-full outline-none border-b border-[#1C2B39]/20 py-1.5 bg-transparent"
              >
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            {["equal", "custom"].map((t) => (
              <button
                key={t}
                onClick={() => setSplitType(t)}
                className={`flex-1 py-1.5 rounded text-xs font-semibold uppercase tracking-wide ${
                  splitType === t ? "bg-[#1F5C56] text-[#ECE7DA]" : "bg-[#ECE7DA] text-[#1C2B39]/60"
                }`}
              >
                {t === "equal" ? "Split equally" : "Custom split"}
              </button>
            ))}
          </div>

          {splitType === "equal" ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {people.map((p) => (
                <button
                  key={p.id}
                  onClick={() => toggleParticipant(p.id)}
                  className={`text-xs px-2.5 py-1 rounded-full border font-medium ${
                    participants.includes(p.id)
                      ? "bg-[#C89B3C]/20 border-[#C89B3C] text-[#1C2B39]"
                      : "border-[#1C2B39]/15 text-[#1C2B39]/40"
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-1.5 pt-1">
              {people.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2">
                  <span className="text-sm">{p.name}</span>
                  <input
                    value={customSplits[p.id] || ""}
                    onChange={(e) => setCustomSplits((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    placeholder="0.00"
                    inputMode="decimal"
                    className="w-20 text-right outline-none border-b border-[#1C2B39]/20 py-0.5 bg-transparent font-mono text-sm"
                  />
                </div>
              ))}
              <div className={`text-xs text-right font-mono ${customValid ? "text-[#3F6B4F]" : "text-[#B23A2E]"}`}>
                ${money(customTotal)} / ${money(amt)}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={addReceipt}
              disabled={!desc.trim() || !amt || !customValid || (splitType === "equal" && participants.length === 0)}
              className="flex-1 py-2 rounded bg-[#1F5C56] text-[#ECE7DA] text-sm font-semibold disabled:opacity-30"
            >
              Save receipt
            </button>
            <button
              onClick={() => {
                resetForm();
                setShowReceiptForm(false);
              }}
              className="px-4 py-2 rounded border border-[#1C2B39]/15 text-sm text-[#1C2B39]/60"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowReceiptForm(true)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border-2 border-dashed border-[#1C2B39]/25 text-[#1C2B39]/60 hover:border-[#1F5C56] hover:text-[#1F5C56] font-medium text-sm"
        >
          <Plus size={16} /> Add receipt
        </button>
      )}
    </div>
  );
}
