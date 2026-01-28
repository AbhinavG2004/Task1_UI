// App.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const STORAGE_KEY = "server_inventory_records_v1";

const OS_OPTIONS = [
  "Windows Server 2019",
  "Windows Server 2022",
  "Ubuntu 20.04",
  "Ubuntu 22.04",
  "Oracle Linux 8",
  "Other",
];

const STATUS_OPTIONS = ["Active", "Decommissioned", "PoweredOff"];

const BACKUP_TYPE_OPTIONS = ["Full", "Incremental", "Differential", "Snapshot", "None"];
const BACKUP_FREQ_OPTIONS = ["Hourly", "Daily", "Weekly", "Monthly", "On-change", "None"];
const CATEGORY_OPTIONS = ["Project", "Product", "Customer"];

const UI_HEADERS = [
  { key: "serverName", label: "Server Name" },
  { key: "ip", label: "Server IP" },
  { key: "purpose", label: "Purpose" },
  { key: "os", label: "OS" },
  { key: "status", label: "Status" },
  { key: "allocatedDate", label: "Allocated Date" },
  { key: "surrenderedDate", label: "Surrendered Date" },
  { key: "category", label: "Category" },
  { key: "owner", label: "Owner" },
  { key: "backupType", label: "Backup Type" },
  { key: "backupFrequency", label: "Backup Frequency" },
  { key: "remarks", label: "Remarks" },
  { key: "additionalRemarks", label: "Additional Remarks" },
];

const EXPORT_HEADERS = [
  { key: "serverName", label: "ServerName" },
  { key: "ip", label: "ServerIP" },
  { key: "purpose", label: "Purpose" },
  { key: "os", label: "OS" },
  { key: "status", label: "Status" },
  { key: "allocatedDate", label: "AllocatedDate" },
  { key: "surrenderedDate", label: "SurrenderedDate" },
  { key: "category", label: "Category" },
  { key: "owner", label: "Owner" },
  { key: "backupType", label: "BackupType" },
  { key: "backupFrequency", label: "BackupFrequency" },
  { key: "remarks", label: "Remarks" },
  { key: "additionalRemarks", label: "AdditionalRemarks" },
];

const initialData = [
  {
    serverName: "PRD-CRM-APP-01",
    ip: "10.20.5.14",
    purpose: "CRM application",
    os: "Ubuntu 22.04",
    status: "Active",
    allocatedDate: "2025-12-01",
    surrenderedDate: "",
    remarks: "Primary app node",
    backupType: "Snapshot",
    category: "Product",
    owner: "CRM Ops Team",
    backupFrequency: "Daily",
    additionalRemarks: "Retention 14 days; backup window 01:00–02:00",
  },
  {
    serverName: "PRD-CRM-DB-01",
    ip: "10.20.5.21",
    purpose: "Database server",
    os: "Windows Server 2022",
    status: "Maintenance",
    allocatedDate: "2025-11-10",
    surrenderedDate: "",
    remarks: "Patch cycle ongoing",
    backupType: "Full",
    category: "Product",
    owner: "DBA Team",
    backupFrequency: "Daily",
    additionalRemarks: "Weekly full + daily incremental",
  },
];

function isValidIPv4(ip) {
  const r =
    /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
  return r.test(String(ip || "").trim());
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeHeader(h) {
  return String(h || "")
    .trim()
    .toLowerCase()
    .replace(/[\s\-_]+/g, "")
    .replace(/[^\w]/g, "");
}

function pickFromOptions(value, options, fallback) {
  const s = String(value ?? "").trim();
  if (!s) return fallback;
  const hit = options.find((x) => x.toLowerCase() === s.toLowerCase());
  return hit || fallback;
}

function toISODate(val) {
  if (val === null || val === undefined || val === "") return "";

  if (val instanceof Date && !isNaN(val.getTime())) {
    return val.toISOString().slice(0, 10);
  }

  if (typeof val === "number") {
    const d = XLSX.SSF.parse_date_code(val);
    if (d && d.y && d.m && d.d) {
      return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
    }
  }

  const s = String(val).trim();
  const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m1) return `${m1[3]}-${String(m1[2]).padStart(2, "0")}-${String(m1[1]).padStart(2, "0")}`;

  const m2 = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (m2) return `${m2[1]}-${String(m2[2]).padStart(2, "0")}-${String(m2[3]).padStart(2, "0")}`;

  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

export default function App() {
  const [activeTab, setActiveTab] = useState("view");

  const [servers, setServers] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const base = !raw
        ? initialData
        : Array.isArray(JSON.parse(raw))
          ? JSON.parse(raw)
          : initialData;

      return base.map((s) => ({
        ...s,
        category: s.category === "Application" ? "Project" : s.category,
      }));
    } catch {
      return initialData;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(servers));
    } catch {
      // ignore
    }
  }, [servers]);

  const emptyForm = {
    serverName: "",
    ip: "",
    purpose: "",
    os: OS_OPTIONS[0],
    status: STATUS_OPTIONS[0],
    allocatedDate: "",
    surrenderedDate: "",
    remarks: "",
    backupType: BACKUP_TYPE_OPTIONS[0],
    category: CATEGORY_OPTIONS[0],
    owner: "",
    backupFrequency: BACKUP_FREQ_OPTIONS[1],
    additionalRemarks: "",
  };

  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [toast, setToast] = useState(null);

  const [query, setQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterCategory, setFilterCategory] = useState("All");
  const [selected, setSelected] = useState(null);

  const fileRef = useRef(null);

  const owners = useMemo(() => {
    const s = new Set(servers.map((x) => x.owner).filter(Boolean));
    return Array.from(s).sort();
  }, [servers]);

  const categories = useMemo(() => {
    const s = new Set([...CATEGORY_OPTIONS, ...servers.map((x) => x.category)]);
    s.delete("");
    return Array.from(s).sort();
  }, [servers]);

  const filteredServers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return servers
      .filter((s) => {
        if (filterStatus !== "All" && s.status !== filterStatus) return false;
        if (filterCategory !== "All" && s.category !== filterCategory) return false;

        if (!q) return true;
        const haystack = [
          s.serverName,
          s.ip,
          s.purpose,
          s.owner,
          s.category,
          s.os,
          s.status,
          s.backupType,
          s.backupFrequency,
          s.allocatedDate,
          s.surrenderedDate,
          s.remarks,
          s.additionalRemarks,
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => a.serverName.localeCompare(b.serverName));
  }, [servers, query, filterStatus, filterCategory]);

  function showToast(message, type = "success") {
    setToast({ message, type });
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => setToast(null), 2500);
  }

  function validate(nextForm) {
    const e = {};

    const name = nextForm.serverName.trim();
    if (!name) e.serverName = "Server Name is required.";

    const ip = nextForm.ip.trim();
    if (!ip) e.ip = "Server IP is required.";
    else if (!isValidIPv4(ip)) e.ip = "Enter a valid IPv4 address (e.g., 10.20.5.14).";

    if (!nextForm.purpose.trim()) e.purpose = "Purpose is required.";
    if (!nextForm.owner.trim()) e.owner = "Owner is required.";

    const alloc = nextForm.allocatedDate;
    if (!alloc) e.allocatedDate = "Allocated Date is required.";
    else if (alloc > todayISO()) e.allocatedDate = "Allocated Date cannot be in the future.";

    const needsSurrender = ["Decommissioned", "Retired"].includes(nextForm.status);
    if (needsSurrender && !nextForm.surrenderedDate) {
      e.surrenderedDate = "Surrendered Date is required for this status.";
    }
    if (nextForm.surrenderedDate && alloc && nextForm.surrenderedDate < alloc) {
      e.surrenderedDate = "Surrendered Date must be on/after Allocated Date.";
    }

    if (nextForm.backupType === "None" && nextForm.backupFrequency !== "None") {
      e.backupFrequency = "Backup Frequency must be None when Backup Type is None.";
    }
    if (nextForm.backupType !== "None" && nextForm.backupFrequency === "None") {
      e.backupFrequency = "Choose a frequency (or set Backup Type to None).";
    }

    return e;
  }

  function onFormChange(field, value) {
    const next = { ...form, [field]: value };
    if (field === "backupType" && value === "None") next.backupFrequency = "None";
    setForm(next);
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function upsertServer(record) {
    setServers((prev) => {
      const idx = prev.findIndex(
        (x) => x.serverName.trim().toLowerCase() === record.serverName.trim().toLowerCase()
      );
      if (idx >= 0) {
        const copy = prev.slice();
        copy[idx] = { ...record };
        return copy;
      }
      return [{ ...record }, ...prev];
    });
  }

  function onSubmit() {
    const e = validate(form);
    setErrors(e);
    if (Object.keys(e).length) return;

    upsertServer({ ...form });
    showToast("Server record saved.");
    setForm(emptyForm);
  }

  function onEdit(server) {
    setForm({ ...server });
    setErrors({});
    setSelected(null);
    setActiveTab("create");
    showToast("Loaded record for update.", "info");
  }

  function onReset() {
    setForm(emptyForm);
    setErrors({});
  }

  function clearAllRecords() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setServers([]);
    setSelected(null);
    showToast("All records cleared.", "info");
  }

  const HEADER_ALIASES = {
    servername: "serverName",
    server: "serverName",
    hostname: "serverName",
    host: "serverName",
    machinename: "serverName",
    systemname: "serverName",

    ip: "ip",
    ipaddress: "ip",
    ipaddr: "ip",
    ipv4: "ip",

    purpose: "purpose",
    usage: "purpose",
    description: "purpose",
    service: "purpose",

    os: "os",
    operatingsystem: "os",

    status: "status",
    state: "status",

    allocateddate: "allocatedDate",
    allocationdate: "allocatedDate",
    allocatedon: "allocatedDate",
    allocated: "allocatedDate",

    surrendereddate: "surrenderedDate",
    surrenderdate: "surrenderedDate",
    surrenderedon: "surrenderedDate",
    surrendered: "surrenderedDate",

    remarks: "remarks",
    remark: "remarks",
    notes: "remarks",

    backuptype: "backupType",
    backup: "backupType",

    category: "category",
    servercategory: "category",

    owner: "owner",
    team: "owner",
    ownedby: "owner",

    backupfrequency: "backupFrequency",
    frequency: "backupFrequency",
    backuprunfrequency: "backupFrequency",

    additionalremarks: "additionalRemarks",
    additionalremark: "additionalRemarks",
    extra: "additionalRemarks",
    extraremarks: "additionalRemarks",
    drnotes: "additionalRemarks",
  };

  function rowToRecord(row) {
    const rec = { ...emptyForm };

    for (const [k, v] of Object.entries(row)) {
      const nk = normalizeHeader(k);
      const field = HEADER_ALIASES[nk];
      if (!field) continue;

      if (field === "allocatedDate" || field === "surrenderedDate") {
        rec[field] = toISODate(v);
      } else {
        rec[field] = String(v ?? "").trim();
      }
    }

    rec.os = pickFromOptions(rec.os, OS_OPTIONS, OS_OPTIONS[0]);
    rec.status = pickFromOptions(rec.status, STATUS_OPTIONS, STATUS_OPTIONS[0]);
    rec.backupType = pickFromOptions(rec.backupType, BACKUP_TYPE_OPTIONS, BACKUP_TYPE_OPTIONS[0]);
    rec.backupFrequency = pickFromOptions(
      rec.backupFrequency,
      BACKUP_FREQ_OPTIONS,
      BACKUP_FREQ_OPTIONS[1]
    );
    rec.category = pickFromOptions(rec.category, CATEGORY_OPTIONS, CATEGORY_OPTIONS[0]);

    return rec;
  }

  async function onImportExcel(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

      if (!rows.length) {
        showToast("Excel is empty.", "info");
        e.target.value = "";
        return;
      }

      let imported = 0;
      let updated = 0;
      let skipped = 0;

      const existingMap = new Map(servers.map((s) => [s.serverName.trim().toLowerCase(), s]));
      const toUpsert = [];

      for (const r of rows) {
        const rec = rowToRecord(r);
        const errs = validate(rec);

        if (Object.keys(errs).length) {
          skipped += 1;
          continue;
        }

        const key = rec.serverName.trim().toLowerCase();
        if (existingMap.has(key)) updated += 1;
        else imported += 1;

        toUpsert.push(rec);
      }

      if (!toUpsert.length) {
        showToast("No valid rows found to import (check required fields).", "info");
        e.target.value = "";
        return;
      }

      setServers((prev) => {
        const map = new Map(prev.map((s) => [s.serverName.trim().toLowerCase(), s]));
        for (const rec of toUpsert) {
          map.set(rec.serverName.trim().toLowerCase(), { ...rec });
        }
        return Array.from(map.values()).sort((a, b) => a.serverName.localeCompare(b.serverName));
      });

      showToast(`Imported ${imported}, updated ${updated}, skipped ${skipped}.`, "success");
    } catch {
      showToast("Failed to import Excel.", "info");
    } finally {
      e.target.value = "";
    }
  }

  function downloadExcelTemplate() {
    const headers = [
      {
        "Server Name": "",
        "IP Address": "",
        Purpose: "",
        OS: "",
        Status: "",
        "Allocated Date": "",
        "Surrendered Date": "",
        Category: "",
        Owner: "",
        "Backup Type": "",
        "Backup Frequency": "",
        Remarks: "",
        "Additional Remarks": "",
      },
    ];

    const ws = XLSX.utils.json_to_sheet(headers, { skipHeader: false });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "server_inventory_template.xlsx");
  }

  function exportExcel(records) {
    const data = records.map((s) => ({
      ServerName: s.serverName,
      ServerIP: s.ip,
      Purpose: s.purpose,
      OS: s.os,
      Status: s.status,
      AllocatedDate: s.allocatedDate,
      SurrenderedDate: s.surrenderedDate || "",
      Category: s.category,
      Owner: s.owner,
      BackupType: s.backupType,
      BackupFrequency: s.backupFrequency,
      Remarks: s.remarks || "",
      AdditionalRemarks: s.additionalRemarks || "",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Servers");
    XLSX.writeFile(wb, "server_inventory_export.xlsx");
  }

  function exportPDF(records) {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

    doc.setFontSize(12);
    doc.text("Server Inventory Export", 40, 40);
    doc.setFontSize(9);
    doc.text(`Records: ${records.length}`, 40, 58);

    const head = [EXPORT_HEADERS.map((h) => h.label)];
    const body = records.map((s) =>
      EXPORT_HEADERS.map((h) => {
        const v = s[h.key];
        return v === null || v === undefined || v === "" ? "" : String(v);
      })
    );

    autoTable(doc, {
      startY: 74,
      head,
      body,
      styles: { fontSize: 7, cellPadding: 3, overflow: "linebreak" },
      headStyles: { fontSize: 7 },
      margin: { left: 40, right: 40 },
    });

    doc.save("server_inventory_export.pdf");
  }

  function goCreateNew() {
    setForm(emptyForm);
    setErrors({});
    setSelected(null);
    setActiveTab("create");
  }

  function backToView() {
    setSelected(null);
    setActiveTab("view");
  }

  return (
    <div className="app">
      <div className="appTitle">AAD_ServerRepository</div>

      {toast && (
        <div className={`toast ${toast.type}`}>
          <span>{toast.message}</span>
        </div>
      )}

      <main className={`container ${activeTab === "create" ? "createCenter" : ""}`}>
        {activeTab === "create" ? (
          <section className="card createCard">
            <div className="cardHeader headerRow">
              <div>
                <div className="cardTitle">Create / Update Server Details</div>
                <div className="cardHint">Manual entry or bulk upload via Excel.</div>
              </div>

              <div className="headerActions">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={onImportExcel}
                  style={{ display: "none" }}
                />
                <button className="btn" onClick={() => fileRef.current?.click()}>
                  Upload Excel
                </button>
                <button className="btn subtle" onClick={downloadExcelTemplate}>
                  Download Template
                </button>
                <button className="btn" onClick={backToView}>
                  Back to View
                </button>
              </div>
            </div>

            <div className="grid grid3x4">
              <Field
                label="Server Name"
                required
                value={form.serverName}
                onChange={(v) => onFormChange("serverName", v)}
                error={errors.serverName}
                placeholder="e.g., PRD-CRM-APP-01"
              />
              <Field
                label="Server IP"
                required
                value={form.ip}
                onChange={(v) => onFormChange("ip", v)}
                error={errors.ip}
                placeholder="e.g., 10.20.5.14"
              />
              <Field
                label="Purpose"
                required
                value={form.purpose}
                onChange={(v) => onFormChange("purpose", v)}
                error={errors.purpose}
                placeholder="Short purpose (app/db/service)"
              />

              <SelectField
                label="OS"
                required
                value={form.os}
                onChange={(v) => onFormChange("os", v)}
                options={OS_OPTIONS}
              />
              <SelectField
                label="Status"
                required
                value={form.status}
                onChange={(v) => onFormChange("status", v)}
                options={STATUS_OPTIONS}
              />
              <DateField
                label="Allocated Date"
                required
                value={form.allocatedDate}
                onChange={(v) => onFormChange("allocatedDate", v)}
                error={errors.allocatedDate}
              />

              <DateField
                label="Surrendered Date"
                required={["Decommissioned", "Retired"].includes(form.status)}
                value={form.surrenderedDate}
                onChange={(v) => onFormChange("surrenderedDate", v)}
                error={errors.surrenderedDate}
              />
              <SelectField
                label="Category"
                required
                value={form.category}
                onChange={(v) => onFormChange("category", v)}
                options={CATEGORY_OPTIONS}
              />
              <Field
                label="Owner"
                required
                value={form.owner}
                onChange={(v) => onFormChange("owner", v)}
                error={errors.owner}
                placeholder="e.g., CRM Ops Team"
              />

              <SelectField
                label="Backup Type"
                required
                value={form.backupType}
                onChange={(v) => onFormChange("backupType", v)}
                options={BACKUP_TYPE_OPTIONS}
              />
              <SelectField
                label="Backup Frequency"
                required
                value={form.backupFrequency}
                onChange={(v) => onFormChange("backupFrequency", v)}
                options={BACKUP_FREQ_OPTIONS}
                error={errors.backupFrequency}
              />
              <Field
                label="Remarks"
                value={form.remarks}
                onChange={(v) => onFormChange("remarks", v)}
                placeholder="Short operational notes"
              />

              <TextAreaField
                label="Additional Remarks"
                value={form.additionalRemarks}
                onChange={(v) => onFormChange("additionalRemarks", v)}
                placeholder="Retention / backup window / DR notes / dependencies"
              />
            </div>

            <div className="actions">
              <button className="btn primary" onClick={onSubmit}>
                Save
              </button>
              <button className="btn" onClick={onReset}>
                Reset
              </button>
              <button className="btn subtle" onClick={backToView}>
                Cancel
              </button>
            </div>
          </section>
        ) : (
          <section className="card">
            <div className="cardHeader">
              <div className="cardTitle">AAD_ServerRepository</div>
              <div className="cardHint">All values are displayed. Click a row for popup view.</div>
            </div>

            <div className="filters">
              <div className="searchBox">
                <input
                  className="input"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name, IP, owner, purpose, OS..."
                />
              </div>

              <div className="filterRow">
                <div className="filter">
                  <label className="label">Status</label>
                  <select
                    className="select"
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                  >
                    <option value="All">All</option>
                    {STATUS_OPTIONS.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="filter">
                  <label className="label">Category</label>
                  <select
                    className="select"
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                  >
                    <option value="All">All</option>
                    {categories.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="meta" style={{ justifyContent: "flex-end" }}>
                  <div className="metaText">
                    Results: <b>{filteredServers.length}</b>
                  </div>
                  <div className="metaText">
                    Owners tracked: <b>{owners.length}</b>
                  </div>
                </div>
              </div>
            </div>

            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    {/* ✅ Edit FIRST column */}
                    <th>Edit</th>
                    {UI_HEADERS.map((h) => (
                      <th key={h.key}>{h.label}</th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {filteredServers.map((s) => (
                    <tr key={s.serverName} onClick={() => setSelected(s)} className="row">
                      {/* ✅ Edit button BEFORE Server Name */}
                      <td className="actionsCell">
                        <button
                          className="btn small"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEdit(s);
                          }}
                        >
                          Edit
                        </button>
                      </td>

                      <td className="mono">{s.serverName}</td>
                      <td className="mono">{s.ip}</td>
                      <td>{s.purpose}</td>
                      <td>{s.os}</td>
                      <td>
                        <span className={`pill ${pillClass(s.status)}`}>{s.status}</span>
                      </td>
                      <td className="mono">{s.allocatedDate || "-"}</td>
                      <td className="mono">{s.surrenderedDate || "-"}</td>
                      <td>{s.category}</td>
                      <td>{s.owner}</td>
                      <td>{s.backupType}</td>
                      <td>{s.backupFrequency}</td>
                      <td>{s.remarks || "-"}</td>
                      <td>{s.additionalRemarks || "-"}</td>
                    </tr>
                  ))}

                  {filteredServers.length === 0 && (
                    <tr>
                      <td colSpan={UI_HEADERS.length + 1} className="empty">
                        No results found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="viewBottomActions">
              <div className="leftActions">
                <button className="btn primary" onClick={goCreateNew}>
                  Create
                </button>
                <button className="btn subtle" onClick={clearAllRecords}>
                  Clear All
                </button>
              </div>

              <div className="rightActions">
                <button className="btn" onClick={() => exportExcel(filteredServers)}>
                  Export Excel
                </button>
                <button className="btn primary" onClick={() => exportPDF(filteredServers)}>
                  Export PDF
                </button>
              </div>
            </div>

            {selected && (
              <div className="modalOverlay" onClick={() => setSelected(null)}>
                <div className="modal" onClick={(e) => e.stopPropagation()}>
                  <div className="modalHeader">
                    {/* Buttons LEFT */}
                    <div style={{ display: "flex", gap: "10px" }}>
                      <button className="btn" onClick={() => onEdit(selected)}>
                        Edit
                      </button>
                      <button className="btn subtle" onClick={() => setSelected(null)}>
                        Close
                      </button>
                    </div>

                    {/* Title RIGHT */}
                    <div>
                      <div className="modalTitle">{selected.serverName}</div>
                      <div className="modalSub mono">{selected.ip}</div>
                    </div>
                  </div>

                  <div className="modalBody">
                    <div className="kvGrid">
                      <KV k="Purpose" v={selected.purpose} />
                      <KV k="Category" v={selected.category} />
                      <KV k="OS" v={selected.os} />
                      <KV k="Status" v={selected.status} />
                      <KV k="Owner" v={selected.owner} />
                      <KV k="Allocated Date" v={selected.allocatedDate || "-"} mono />
                      <KV k="Surrendered Date" v={selected.surrenderedDate || "-"} mono />
                      <KV k="Backup Type" v={selected.backupType} />
                      <KV k="Backup Frequency" v={selected.backupFrequency} />
                      <KV k="Remarks" v={selected.remarks || "-"} wide />
                      <KV k="Additional Remarks" v={selected.additionalRemarks || "-"} wide />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

function Field({ label, required, value, onChange, error, placeholder }) {
  return (
    <div className="field">
      <label className="label">
        {label} {required ? <span className="req">*</span> : null}
      </label>
      <input
        className={error ? "input error" : "input"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {error ? <div className="errorText">{error}</div> : null}
    </div>
  );
}

function DateField({ label, required, value, onChange, error }) {
  return (
    <div className="field">
      <label className="label">
        {label} {required ? <span className="req">*</span> : null}
      </label>
      <input
        type="date"
        className={error ? "input error" : "input"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {error ? <div className="errorText">{error}</div> : null}
    </div>
  );
}

function SelectField({ label, required, value, onChange, options, error }) {
  return (
    <div className="field">
      <label className="label">
        {label} {required ? <span className="req">*</span> : null}
      </label>
      <select
        className={error ? "select error" : "select"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </select>
      {error ? <div className="errorText">{error}</div> : null}
    </div>
  );
}

function TextAreaField({ label, value, onChange, placeholder }) {
  return (
    <div className="field full">
      <label className="label">{label}</label>
      <textarea
        className="textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
      />
    </div>
  );
}

function KV({ k, v, mono, wide }) {
  return (
    <div className={wide ? "kv wide" : "kv"}>
      <div className="k">{k}</div>
      <div className={mono ? "v mono" : "v"}>{v}</div>
    </div>
  );
}

function pillClass(status) {
  if (status === "Active") return "good";
  if (status === "Decommissioned") return "info";
  if (status === "PoweredOff") return "bad";
  return "neutral";
}
