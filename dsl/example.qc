// ═══════════════════════════════════════════════════════
//  example.qc — QCNOTE.js demo schema
//  Shows all language features
// ═══════════════════════════════════════════════════════

// ── Store Definitions ────────────────────────────────────

store "users" {
  key: id auto
  field name: str @index
  field email: str @index @secret
  field age: num
  field role: str
  field active: bool
  field meta: json
  ttl: 30d
}

store "sessions" {
  key: sid auto
  field userId: num @index
  field token: str @secret
  field createdAt: date
  field ip: str
  ttl: 1h
}

store "documents" {
  key: docId auto
  field title: str @index
  field body: str @secret
  field tags: json
  field authorId: num @index
  field size: num
  field createdAt: date
  ttl: 7d
}

// ── Insert Records ────────────────────────────────────────

put users { name: "Alice Chen", age: 28, email: "alice@qcnote.dev", role: "admin", active: true, meta: {} }
put users { name: "Bob Lee", age: 35, email: "bob@qcnote.dev", role: "user", active: true, meta: {} }

put sessions { userId: 1, token: "eyJhbGci...", ip: "127.0.0.1" }

put documents {
  title: "QCNOTE Reference",
  body: "Fast, light, and secure local storage.",
  authorId: 1,
  size: 1024,
  tags: {}
}

// ── Queries ───────────────────────────────────────────────

// Get by primary key
get users[1]

// Get first match
get users where email = "alice@qcnote.dev"

// Find with conditions
find users where age > 25 limit 10 sort age desc

// Complex where clause
find users where (role = "admin" or role = "user") and active = true

// Range query
find documents where size between 100 500 sort size asc

// Like / substring match
find users where name ~= "Alice"

// IN query
find users where role := ["admin", "moderator"]

// Count
count users where active = true

// Delete by key
del users[99]

// Delete by condition
del sessions where userId = 1

// Clear a store
clear sessions

// ── TypeScript Interop ────────────────────────────────────

ts: const greeting: string = "Hello from QCNOTE!";
ts: console.log(greeting);

// Export TypeScript type alias
export users as User
export documents as Document
