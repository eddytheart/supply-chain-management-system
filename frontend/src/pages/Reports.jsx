import { useState } from 'react';
import { api, download } from '../api';
import { formatMoney } from '../format';
import { DataState, Empty, Field, Notice, PageHeader, StatusChip, useLoad } from '../ui';

const REPORTS = [
  { key: 'requisitions', label: 'Requisitions', dated: true },
  { key: 'stock', label: 'Stock levels', dated: false },
  { key: 'low-stock', label: 'Low stock', dated: false },
  { key: 'purchase-orders', label: 'Purchase orders by supplier', dated: true },
];

function RequisitionsTables({ data }) {
  return (
    <>
      <p><strong>{data.total}</strong> requisitions in this period.</p>
      <div className="cols">
        <div className="table-wrap">
          <table className="ledger">
            <thead><tr><th>Status</th><th className="num">Count</th></tr></thead>
            <tbody>{data.byStatus.map((x) => <tr key={x.status}><td><StatusChip status={x.status} /></td><td className="num">{x.count}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="table-wrap">
          <table className="ledger">
            <thead><tr><th>Department</th><th className="num">Count</th></tr></thead>
            <tbody>
              {data.byDepartment.length === 0 ? <tr><td colSpan="2" className="muted">No requisitions in this period.</td></tr>
                : data.byDepartment.map((x) => <tr key={x.department}><td>{x.department}</td><td className="num">{x.count}</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function StockTable({ rows, empty }) {
  if (rows.length === 0) return <Empty title={empty} />;
  return (
    <div className="table-wrap">
      <table className="ledger">
        <thead><tr><th>Item</th><th>Unit</th><th className="num">In stock</th><th className="num">Reorder level</th>{rows[0].isLowStock !== undefined && <th>Level</th>}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.item}>
              <td>{r.item}</td><td>{r.unit}</td><td className="num">{r.quantityInStock}</td><td className="num">{r.reorderLevel}</td>
              {r.isLowStock !== undefined && <td><StatusChip status={r.isLowStock ? 'low' : 'ok'} /></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PurchaseOrdersTable({ data }) {
  if (data.bySupplier.length === 0) return <Empty title="No purchase orders in this period." />;
  return (
    <div className="table-wrap">
      <table className="ledger">
        <thead><tr><th>Supplier</th><th className="num">Orders</th><th className="num">Value</th></tr></thead>
        <tbody>{data.bySupplier.map((x) => <tr key={x.supplier}><td>{x.supplier}</td><td className="num">{x.orders}</td><td className="num">{formatMoney(x.totalValue)}</td></tr>)}</tbody>
        <tfoot><tr><td colSpan="2">Total</td><td className="num">{formatMoney(data.grandTotal)}</td></tr></tfoot>
      </table>
    </div>
  );
}

export default function Reports() {
  const [key, setKey] = useState('requisitions');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const report = REPORTS.find((r) => r.key === key);
  const query = report.dated ? [from && `from=${from}`, to && `to=${to}`].filter(Boolean).join('&') : '';

  // The loaded data remembers which report it belongs to. Without this, the first screen drawn after
  // switching reports used the previous report's data, which does not fit and crashed the page.
  const { data: loaded, error, loading } = useLoad(
    async () => ({ key, body: await api.get(`/reports/${key}${query ? `?${query}` : ''}`) }),
    [key, from, to]
  );
  const data = loaded && loaded.key === key ? loaded.body : null;

  async function downloadCsv() {
    setDownloadError('');
    try {
      await download(`/reports/${key}?format=csv${query ? `&${query}` : ''}`, `${key}_report.csv`);
    } catch (err) {
      setDownloadError(err.message);
    }
  }

  return (
    <>
      <PageHeader title="Reports">
        <button type="button" className="btn btn-quiet" onClick={downloadCsv}>Download CSV</button>
        <button type="button" className="btn btn-quiet" onClick={() => window.print()}>Print or save as PDF</button>
      </PageHeader>
      {downloadError && <Notice kind="error">{downloadError}</Notice>}

      <div className="inline-fields no-print" style={{ marginBottom: 20 }}>
        <Field label="Report">
          <select value={key} onChange={(e) => setKey(e.target.value)}>
            {REPORTS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </Field>
        {report.dated && (
          <>
            <Field label="From"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="To"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          </>
        )}
      </div>

      <h2 style={{ marginBottom: 12 }}>{report.label}{report.dated && (from || to) ? `, ${from || 'start'} to ${to || 'today'}` : ''}</h2>
      <DataState loading={loading} error={error}>
        {data && key === 'requisitions' && <RequisitionsTables data={data} />}
        {data && key === 'stock' && <StockTable rows={data} empty="No items in the catalogue yet." />}
        {data && key === 'low-stock' && <StockTable rows={data} empty="No items are low on stock." />}
        {data && key === 'purchase-orders' && <PurchaseOrdersTable data={data} />}
      </DataState>
    </>
  );
}
