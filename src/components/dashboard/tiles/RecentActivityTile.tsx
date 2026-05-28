'use client';

export default function RecentActivityTile() {
  return (
    <div className="flex h-full flex-col p-4">
      <div
        className="flex flex-1 flex-col items-center justify-center rounded-lg p-6 text-center"
        style={{ background: 'rgb(var(--pe-ice))' }}
      >
        <p className="pe-body" style={{ color: 'rgb(var(--pe-grey-70))' }}>
          No recent activity
        </p>
        <p className="pe-medium mt-1" style={{ color: 'rgb(var(--pe-grey-40))' }}>
          Your recent actions will show up here.
        </p>
      </div>
    </div>
  );
}
