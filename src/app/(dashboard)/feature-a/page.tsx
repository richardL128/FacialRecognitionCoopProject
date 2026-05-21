'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';

type Employee = {
  id: string;
  firstName: string;
  name: string;
  email: string | null;
  active: boolean;
  createdAt: string;
  faceCount: number;
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
  const [enrolling, setEnrolling] = useState(false);

  const [employeeName, setEmployeeName] = useState('');
  const [employeeEmail, setEmployeeEmail] = useState('');

  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [captureId, setCaptureId] = useState('');

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

  async function enrollCapture(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEnrolling(true);
    setError(null);
    try {
      const response = await fetch('/api/feature-a/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: selectedEmployeeId,
          captureId,
        }),
      });
      const payload = (await response.json()) as { success: boolean; error?: { message: string } };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error?.message ?? 'Unable to enroll capture');
      }

      setCaptureId('');
      await loadEmployees();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to enroll capture');
    } finally {
      setEnrolling(false);
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
      <div className="rounded-xl border border-[rgb(var(--pe-grey-20))] bg-[rgb(var(--pe-primary))] p-6">
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
          Build the preexisting face library by creating employees and enrolling known camera
          captures.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-[rgb(var(--pe-red-100))] bg-[rgb(var(--pe-red-10))] px-3 py-2">
          <p className="pe-body" style={{ color: 'rgb(var(--pe-red-100))' }}>
            {error}
          </p>
        </div>
      )}

      <section className="rounded-xl border border-[rgb(var(--pe-grey-20))] bg-[rgb(var(--pe-primary))] p-4">
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

      <section className="rounded-xl border border-[rgb(var(--pe-grey-20))] bg-[rgb(var(--pe-primary))] p-4">
        <h2 className="pe-h5" style={{ color: 'rgb(var(--pe-grey-100))' }}>
          Enroll Capture Into Library
        </h2>
        <p className="pe-small mt-1" style={{ color: 'rgb(var(--pe-grey-70))' }}>
          Use a capture ID from camera history to add it as a reference image for an employee.
        </p>
        <form className="mt-3 grid gap-3 md:grid-cols-3" onSubmit={enrollCapture}>
          <select
            value={selectedEmployeeId}
            onChange={(e) => setSelectedEmployeeId(e.target.value)}
            className="pe-grid-select"
            required
          >
            <option value="">Select employee</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.firstName} - {employee.name}
              </option>
            ))}
          </select>
          <input
            value={captureId}
            onChange={(e) => setCaptureId(e.target.value)}
            className="pe-grid-input"
            placeholder="Capture ID (uuid)"
            required
          />
          <div>
            <button
              type="submit"
              className="pe-btn rounded-md border border-[rgb(var(--pe-blue-100))] bg-[rgb(var(--pe-blue-100))] px-4 py-2 text-[rgb(var(--pe-grey-5))] disabled:cursor-not-allowed disabled:opacity-70"
              disabled={enrolling}
            >
              {enrolling ? 'Enrolling...' : 'Enroll Capture'}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-[rgb(var(--pe-grey-20))] bg-[rgb(var(--pe-primary))] p-4">
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
                  <th className="text-left">Reference Images</th>
                  <th className="text-left">Created</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((employee) => (
                  <tr key={employee.id}>
                    <td>{employee.firstName}</td>
                    <td>{employee.name}</td>
                    <td>{employee.email ?? '—'}</td>
                    <td>{employee.faceCount}</td>
                    <td>{new Date(employee.createdAt).toLocaleDateString()}</td>
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
