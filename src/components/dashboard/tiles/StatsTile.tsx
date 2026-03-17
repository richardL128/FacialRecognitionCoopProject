'use client';

export default function StatsTile() {
  return (
    <div className="flex h-full flex-col p-4">
      <div className="grid grid-cols-3 gap-3">
        {(['Stat 1', 'Stat 2', 'Stat 3'] as const).map((label) => (
          <div
            key={label}
            className="flex flex-col rounded-lg p-3"
            style={{ background: 'rgb(var(--pe-ice))' }}
          >
            <p className="pe-small" style={{ color: 'rgb(var(--pe-grey-60))' }}>{label}</p>
            <p className="pe-h4 mt-1" style={{ color: 'rgb(var(--pe-grey-100))' }}>—</p>
          </div>
        ))}
      </div>
      <p className="pe-small mt-auto" style={{ color: 'rgb(var(--pe-grey-40))' }}>
        Replace with your key metrics.
      </p>
    </div>
  );
}
