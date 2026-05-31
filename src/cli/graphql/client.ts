/**
 * A tiny GraphQL-over-HTTP client. The frontend talks to the backend purely
 * through this transport: it POSTs a query document plus variables and returns
 * the typed `data` payload, throwing on transport or GraphQL errors. Keeping the
 * client this small means the repository — not the UI — owns every request.
 */
export interface GraphqlError {
  message: string;
}

export class GraphqlRequestError extends Error {
  constructor(message: string, readonly errors?: GraphqlError[]) {
    super(message);
    this.name = 'GraphqlRequestError';
  }
}

export class GraphqlClient {
  constructor(
    private readonly url: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  /** Execute a query/mutation document and return its `data` payload. */
  async request<TData>(document: string, variables?: Record<string, unknown>): Promise<TData> {
    const response = await this.fetchImpl(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: document, variables }),
    });

    if (!response.ok) {
      throw new GraphqlRequestError(`GraphQL request failed with HTTP ${response.status}`);
    }

    const body = (await response.json()) as { data?: TData; errors?: GraphqlError[] };
    if (body.errors && body.errors.length > 0) {
      throw new GraphqlRequestError(body.errors.map((error) => error.message).join('; '), body.errors);
    }
    if (body.data == null) {
      throw new GraphqlRequestError('GraphQL response contained no data');
    }
    return body.data;
  }
}
