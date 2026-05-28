type ErrorDetails = {
  rawCode?: string;
  rawMessage: string;
  context: string;
};

export type ClassifiedDatabaseError = {
  code: string;
  status: number;
  message: string;
  details: ErrorDetails;
};

function getRawCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const maybeCode = (error as { code?: unknown }).code;
  if (typeof maybeCode === 'string' && maybeCode.length > 0) return maybeCode;
  return undefined;
}

function getRawMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function normalizedMessage(error: unknown): string {
  return getRawMessage(error).toLowerCase();
}

export function isLikelyDatabaseError(error: unknown): boolean {
  const message = normalizedMessage(error);
  const name =
    error && typeof error === 'object' && 'name' in error ? String(error.name).toLowerCase() : '';

  return (
    message.includes('prisma') ||
    message.includes('database') ||
    message.includes('postgres') ||
    message.includes('connection string') ||
    message.includes('econnrefused') ||
    message.includes('etimedout') ||
    message.includes('28p01') ||
    name.includes('prismaclient')
  );
}

export function classifyDatabaseError(error: unknown, context: string): ClassifiedDatabaseError {
  const message = normalizedMessage(error);
  const rawMessage = getRawMessage(error);
  const rawCode = getRawCode(error);
  const details: ErrorDetails = { rawCode, rawMessage, context };

  if (message.includes('econnrefused') || message.includes('connection refused')) {
    return {
      code: 'DATABASE_UNREACHABLE',
      status: 503,
      message:
        'Database connection refused. Ensure PostgreSQL is running and DATABASE_URL points to the correct host and port.',
      details,
    };
  }

  if (message.includes('etimedout') || message.includes('timeout')) {
    return {
      code: 'DATABASE_TIMEOUT',
      status: 503,
      message:
        'Database connection timed out. Verify network routing, firewall rules, and the database host in DATABASE_URL.',
      details,
    };
  }

  if (
    message.includes('password authentication failed') ||
    message.includes('authentication failed') ||
    message.includes('28p01') ||
    message.includes('invalid authorization specification')
  ) {
    return {
      code: 'DATABASE_AUTH_FAILED',
      status: 503,
      message:
        'Database authentication failed. Verify database username/password in DATABASE_URL and confirm the role has access.',
      details,
    };
  }

  if (
    message.includes('does not exist') &&
    (message.includes('employee_profiles') || message.includes('employee_face_library'))
  ) {
    return {
      code: 'EMPLOYEE_DB_SCHEMA_MISSING',
      status: 500,
      message:
        'Employee database schema is missing. Run migrations before using Employee Database endpoints.',
      details,
    };
  }

  if (message.includes('foreign key') && message.includes('tenant_id')) {
    return {
      code: 'EMPLOYEE_DB_TENANT_INVALID',
      status: 400,
      message:
        'Tenant context is invalid for Employee Database. Ensure session tenant exists and DEV_BYPASS_* values reference seeded tenant/user IDs.',
      details,
    };
  }

  if (message.includes('database_url') || message.includes('connection string')) {
    return {
      code: 'DATABASE_URL_INVALID',
      status: 500,
      message:
        'DATABASE_URL is missing or invalid. Configure .env.local for npm dev and docker-compose environment for container runs.',
      details,
    };
  }

  return {
    code: 'DATABASE_QUERY_FAILED',
    status: 500,
    message:
      'Database query failed due to an unexpected error. Inspect server logs for raw database error details and request correlation metadata.',
    details,
  };
}
