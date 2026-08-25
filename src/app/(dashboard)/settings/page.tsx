export default function SettingsPage() {
  return (
    <div>
      <h1 className="pe-h2" style={{ color: 'rgb(var(--pe-grey-100))' }}>Settings</h1>
      <div
        className="mt-6 flex flex-col items-center justify-center rounded-lg p-12 text-center"
        style={{ background: 'rgb(var(--pe-primary))', border: '1px solid rgb(var(--pe-grey-20))' }}
      >
        <p className="pe-body" style={{ color: 'rgb(var(--pe-grey-70))' }}>Settings coming soon</p>
        <p className="pe-small mt-1" style={{ color: 'rgb(var(--pe-grey-40))' }}>
          Tenant configuration, user management, and preferences will be available here.
        </p>
      </div>
    </div>
  );
}
