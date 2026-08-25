'use client';

export default function OverviewTile() {
  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg p-3" style={{ background: 'rgb(var(--pe-ice))' }}>
          <p className="pe-small" style={{ color: 'rgb(var(--pe-grey-60))' }}>Metric A</p>
          <p className="pe-h4 mt-1" style={{ color: 'rgb(var(--pe-grey-100))' }}>—</p>
        </div>
        <div className="rounded-lg p-3" style={{ background: 'rgb(var(--pe-ice))' }}>
          <p className="pe-small" style={{ color: 'rgb(var(--pe-grey-60))' }}>Metric B</p>
          <p className="pe-h4 mt-1" style={{ color: 'rgb(var(--pe-grey-100))' }}>—</p>
        </div>
      </div>
      <p className="pe-small mt-auto" style={{ color: 'rgb(var(--pe-grey-40))' }}>
        Replace this tile with your overview metrics.
      </p>
    </div>
  );
}
