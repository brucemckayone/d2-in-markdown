# D2 Extension Test

## Basic Connection

```d2
x -> y: hello world
```

## Container with Nested Shapes

```d2
server: {
  api: API Server
  db: Database

  api -> db: query
}

client -> server.api: request
```

## Sequence Diagram

```d2
shape: sequence_diagram
alice -> bob: Hello!
bob -> alice: Hi back!
```

## SQL Table

```d2
users: {
  shape: sql_table
  id: int {constraint: primary_key}
  name: varchar
  email: varchar
}
```

## Import Test

```d2
@import "./diagrams/architecture.d2"
```

## Deliberate Error (should show red error box)

```d2
-> invalid syntax here {{{
```
