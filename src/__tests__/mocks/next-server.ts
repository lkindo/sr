export class NextRequest extends Request {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(input, init)
  }
}

export class NextResponse<T = any> extends Response {
  static json<T = any>(data: T, init?: ResponseInit): NextResponse<T> {
    return new Response(JSON.stringify(data), {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...init?.headers,
      },
    }) as NextResponse<T>
  }
}


