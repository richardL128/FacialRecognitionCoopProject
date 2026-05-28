'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';

type Employee = {
  id: string;
  firstName: string;
  name: string;
  email: string | null;
  active: boolean;
  createdAt: string;
  photoCount: number;
};

type EmployeesResponse = {
  success: boolean;
  data?: {
    employees: Employee[];
  };
  error?: {
    code: string;
    message: string;
  };
};

export default function EmployeeDatabasePage() {
  const { enabled, loading } = useFeatureFlag('module:feature-a', true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [employeeName, setEmployeeName] = useState('');
  const [employeeEmail, setEmployeeEmail] = useState('');

  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');

  const loadEmployees = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch('/api/feature-a/employees');
      const payload = (await response.json()) as EmployeesResponse;
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error?.message ?? 'Unable to load employees');
      }
      setEmployees(payload.data.employees);
      if (!selectedEmployeeId && payload.data.employees[0]) {
        setSelectedEmployeeId(payload.data.employees[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load employees');
    }
  }, [selectedEmployeeId]);

  useEffect(() => {
    if (!loading && enabled) {
      loadEmployees();
    }
  }, [enabled, loading, loadEmployees]);

  async function createEmployee(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/feature-a/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: employeeName,
          email: employeeEmail || undefined,
        }),
      });
      const payload = (await response.json()) as { success: boolean; error?: { message: string } };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error?.message ?? 'Unable to create employee');
      }

      setEmployeeName('');
      setEmployeeEmail('');
      await loadEmployees();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create employee');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="pe-body" style={{ color: 'rgb(var(--pe-grey-70))' }}>
          Loading employee database...
        </p>
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="pe-surface p-6">
        <h1 className="pe-h2" style={{ color: 'rgb(var(--pe-grey-100))' }}>
          Employee Database Unavailable
        </h1>
        <p className="pe-body mt-2" style={{ color: 'rgb(var(--pe-grey-70))' }}>
          This module is currently disabled for your tenant.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="pe-h2" style={{ color: 'rgb(var(--pe-grey-100))' }}>
          Employee Database
        </h1>
        <p className="pe-body mt-2" style={{ color: 'rgb(var(--pe-grey-70))' }}>
          Manage employee profiles.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-[rgb(var(--pe-red-100))] bg-[rgb(var(--pe-red-10))] px-3 py-2">
          <p className="pe-body" style={{ color: 'rgb(var(--pe-red-100))' }}>
            {error}
          </p>
        </div>
      )}

      <section className="pe-surface p-4">
        <h2 className="pe-h5" style={{ color: 'rgb(var(--pe-grey-100))' }}>
          Create Employee Profile
        </h2>
        <form className="mt-3 grid gap-3 md:grid-cols-2" onSubmit={createEmployee}>
          <input
            value={employeeName}
            onChange={(e) => setEmployeeName(e.target.value)}
            className="pe-grid-input"
            placeholder="Full name"
            required
          />
          <input
            value={employeeEmail}
            onChange={(e) => setEmployeeEmail(e.target.value)}
            className="pe-grid-input"
            placeholder="Email (optional)"
            type="email"
          />
          <div className="md:col-span-2">
            <button
              type="submit"
              className="pe-btn rounded-md border border-[rgb(var(--pe-blue-100))] bg-[rgb(var(--pe-blue-100))] px-4 py-2 text-[rgb(var(--pe-grey-5))] disabled:cursor-not-allowed disabled:opacity-70"
              disabled={submitting}
            >
              {submitting ? 'Creating...' : 'Create Employee'}
            </button>
          </div>
        </form>
      </section>

      <section className="pe-surface p-4">
        <h2 className="pe-h5" style={{ color: 'rgb(var(--pe-grey-100))' }}>
          Employee Library
        </h2>
        {employees.length === 0 ? (
          <p className="pe-body mt-2" style={{ color: 'rgb(var(--pe-grey-70))' }}>
            No employee profiles yet.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className="text-left">First Name</th>
                  <th className="text-left">Name</th>
                  <th className="text-left">Email</th>
                  <th className="text-left">Created</th>
                  <th className="text-left">Photos</th>
                  <th className="text-left">Photo Access</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((employee) => (
                  <tr key={employee.id}>
                    <td>{employee.firstName}</td>
                    <td>{employee.name}</td>
                    <td>{employee.email ?? '—'}</td>
                    <td>{new Date(employee.createdAt).toLocaleDateString()}</td>
                    <td>
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{
                          background:
                            employee.photoCount > 0
                              ? 'rgb(var(--pe-blue-10))'
                              : 'rgb(var(--pe-grey-10))',
                          color:
                            employee.photoCount > 0
                              ? 'rgb(var(--pe-blue-100))'
                              : 'rgb(var(--pe-grey-60))',
                        }}
                      >
                        {employee.photoCount}
                      </span>
                    </td>
                    <td>
                      <Link
                        href={{ pathname: '/feature-a/photos', query: { employeeId: employee.id } }}
                        className="pe-btn inline-flex rounded-md border border-[rgb(var(--pe-grey-20))] px-3 py-1.5 text-sm text-[rgb(var(--pe-grey-80))] hover:bg-[rgb(var(--pe-ice))]"
                      >
                        Add Photo
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
