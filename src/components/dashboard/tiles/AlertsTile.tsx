'use client';

export default function AlertsTile() {
  return (
    <div className="flex h-full flex-col p-4">
      <div
        className="flex flex-1 flex-col items-center justify-center rounded-lg p-6 text-center"
        style={{ background: 'rgb(var(--pe-ice))' }}
      >
        <p className="pe-body" style={{ color: 'rgb(var(--pe-grey-70))' }}>No alerts</p>
        <p className="pe-small mt-1" style={{ color: 'rgb(var(--pe-grey-40))' }}>
          System alerts and warnings will appear here.
        </p>
      </div>
    </div>
  );
}
