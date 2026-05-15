# Core Concepts — Visual Architecture Pack

## 1. Core Mental Model

### The Three Load-Bearing Concepts

```mermaid
flowchart TB
    B[Bundle]

    C1[Consumes Capabilities]
    C2[Implements Capabilities]
    C3[Publishes Contributions]
    C4[Owns Lifecycle]

    B --> C1
    B --> C2
    B --> C3
    B --> C4

    CAP[Capability
    Typed Contract]
    CONTRIB[Contribution
    Published Entry]

    C1 --> CAP
    C2 --> CAP
    C3 --> CONTRIB
```

---

### Capability vs Contribution

```mermaid
flowchart LR

    subgraph Platform
        REG1[Capability Registry]
        REG2[Contribution Registry]
    end

    subgraph Bundle
        CMD[Command Handler]
        VIEW[View]
        LOGIC[Business Logic]
    end

    BundleUser[Consumer]

    BundleUser -->|bind + call| REG1
    REG1 -->|resolve| LOGIC

    CMD -->|register| REG2
    VIEW -->|register| REG2

    REG2 --> Shell[Workbench Shell]
```

---

## 2. Authority / Process Architecture

### High-Level Process Topology

```mermaid
flowchart TB

    subgraph Renderer[Renderer Process
    Chromium Sandbox]

        SHELL[Workbench Shell
        React]

        subgraph IFRAMES[Bundle View Iframes]
            VIEW1[patients/sidebar]
            VIEW2[patients/editor]
        end
    end

    subgraph Main[Main Process
    Trusted Authority]
        CAPREG[Capability Registry]
        CONTRIBREG[Contribution Registry]
        SQLITE[(SQLite)]
        KEK[KEK / Crypto]
        AUDIT[Audit Log]
    end

    subgraph Host[Bundle Host
    Node utilityProcess]
        ACTIVATE["activate()"]
        BUNDLELOGIC[Bundle Logic]
        HOSTCAPS[Host Capability Implementations]
    end

    SHELL -->|bindCapability| CAPREG
    VIEW1 -->|bridge| CAPREG
    VIEW2 -->|bridge| CAPREG

    CAPREG --> SQLITE
    CAPREG --> KEK
    CAPREG --> AUDIT

    CAPREG --> HOSTCAPS

    ACTIVATE --> CONTRIBREG

    CONTRIBREG --> SHELL
```

---

### Trust Hierarchy

```mermaid
flowchart TB

    MAIN[Main Process
    Highest Trust
    Owns PHI
    Owns Persistence
    Owns Crypto]

    HOST[Bundle Host
    Medium Trust
    Business Logic
    No Raw System Access]

    RENDERER[Renderer
    Lowest Trust
    Presentation Only
    Transient PHI]

    MAIN --> HOST
    HOST --> RENDERER
```

---

### Allowed vs Forbidden Communication

```mermaid
flowchart LR

    Renderer[Renderer]
    Main[Main]
    Host[Bundle Host]
    DB[(SQLite)]

    Renderer -->|Allowed
    Capability IPC| Main
    Main -->|Allowed
    Brokered Calls| Host
    Main -->|Allowed| DB
    Host -->|Allowed
    Capability Calls| Main

    Renderer -. Forbidden .-> Host
    Renderer -. Forbidden .-> DB
    Host -. Forbidden .-> DB
```

---

## 3. Bundle Anatomy

### Internal Structure of a Bundle

```mermaid
flowchart TB

    subgraph Bundle[patients Bundle]

        ACT["activate()"]

        subgraph Consumes
            C1[local.notes]
            C2[audit.log]
        end

        subgraph Implements
            I1[patients.lookup]
        end

        subgraph Publishes
            P1[commands]
            P2[views]
            P3[validators]
        end

        DISP[Disposable Aggregate]

        ACT --> Consumes
        ACT --> Implements
        ACT --> Publishes

        Consumes --> DISP
        Implements --> DISP
        Publishes --> DISP
    end
```

---

### Bundle Spans Two Processes

```mermaid
flowchart LR

    subgraph Renderer
        IFRAME[Sandboxed Iframe
        Bundle UI]
    end

    subgraph Host[Bundle Host]
        LOGIC["Business Logic activate()
        Capability Implementations"]
    end

    LOGIC <--> |view bridge| IFRAME
```

---

## 4. System Diagram

```mermaid
flowchart TB

    subgraph Renderer[Renderer Process]

        SHELL[Workbench Shell
        React]

        subgraph Views[Sandboxed Bundle Iframes]
            V1[Bundle View A]
            V2[Bundle View B]
        end
    end

    subgraph Main[Main Process]

        IPC[window.soam.bindCapability]

        CAPS[Capability Registry]

        CONTRIBS[Contribution Registry]

        DB[(SQLite)]
        CRYPTO[KEK / Crypto]
        AUDIT[Audit]

    end

    subgraph Host[Bundle Host utilityProcess]

        ACTIVATE["activate()"]

        BUNDLE[Bundle Logic]

        HOSTCAP[Host Capability Handlers]

    end

    SHELL --> IPC
    V1 --> IPC
    V2 --> IPC

    IPC --> CAPS

    CAPS --> DB
    CAPS --> CRYPTO
    CAPS --> AUDIT

    CAPS --> HOSTCAP

    ACTIVATE --> CONTRIBS

    CONTRIBS --> SHELL

    HOSTCAP <--> BUNDLE

    BUNDLE <--> V1
    BUNDLE <--> V2
```

---

## 5. End-to-End Sequence — “Open Patient Record”

```mermaid
sequenceDiagram

    participant User
    participant Renderer
    participant Main
    participant Host
    participant SQLite
    participant Iframe

    User->>Renderer: Open command palette

    Renderer->>Renderer: Read contributions.commands

    User->>Renderer: Select “Open Patient Record”

    Renderer->>Main: commands.run(...)

    Main->>Host: Route command handler

    Host->>Main: local.notes.open(patientId)

    Main->>Main: Check workspace lock
    Main->>Main: Emit audit log

    Main->>SQLite: Query encrypted note
    SQLite-->>Main: Ciphertext

    Main->>Main: Decrypt with KEK

    Main-->>Host: Decrypted note

    Host->>Iframe: postMessage(note-loaded)

    Iframe->>Iframe: Render note
```

---

## 6. PHI Enforcement Model

### Structural PHI Enforcement

```mermaid
flowchart TB

    subgraph BundleHost[Bundle Host]
        MALICIOUS[Potentially Malicious Dependency]
    end

    subgraph Main[Main Authority]
        PHI[PHI Capability Handler]
        AUDIT[Audit Enforcement]
        LOCK[Workspace Lock Check]
        BROKER[Brokered Networking]
    end

    subgraph External
        CLOUD[(Cloud Service)]
    end

    MALICIOUS -. fs blocked .-> PHI
    MALICIOUS -. net blocked .-> CLOUD

    MALICIOUS -->|Capability Call| PHI

    PHI --> AUDIT
    PHI --> LOCK

    PHI -->|Controlled Result| MALICIOUS

    MALICIOUS -->|Brokered Request| BROKER

    BROKER --> CLOUD
```

---

### Why Main Owns PHI

```mermaid
flowchart LR

    DB[(Encrypted SQLite)] --> MAIN[Main Handler]

    MAIN --> CHECK1[Workspace Lock Check]
    MAIN --> CHECK2[Audit Emit]
    MAIN --> CHECK3[Decrypt with KEK]

    CHECK1 --> RESULT[Return PHI]
    CHECK2 --> RESULT
    CHECK3 --> RESULT

    RESULT --> HOST[Bundle Host]
    RESULT --> RENDERER[Renderer UI]
```

---

## 7. Capability Resolution Flow

```mermaid
flowchart LR

    Caller[Renderer or Host]

    Caller -->|bindCapability| Registry[Main Capability Registry]

    Registry --> Decision{Where is handler?}

    Decision -->|Main-implemented| MainHandler[Main Handler]

    Decision -->|Host-implemented| HostHandler[Bundle Host Handler]

    Decision -->|Cloud-backed| Broker[Cloud Broker]
```

---

## 8. Contribution Flow

```mermaid
flowchart TB

    subgraph Bundle
        CMD[commands]
        VIEW[views]
        SETTINGS[settings]
        VALIDATORS[validators]
    end

    Bundle --> MainReg[Contribution Registry]

    MainReg --> Renderer[Workbench Shell]

    Renderer --> Palette[Command Palette]
    Renderer --> Sidebar[Sidebar]
    Renderer --> Menus[Menus]
    Renderer --> SettingsUI[Settings UI]
```

---

## 10. Key Architectural Invariants

### Invariant #1 — One IPC Door

```text
New features do NOT add preload methods.

Everything goes through:

window.soam.bindCapability(...)
```

### Invariant #2 — Renderer Never Reaches Data Directly

```text
Renderer
  -> Capability
    -> Main
      -> Data
```

### Invariant #3 — Shared Logic Moves Down, Never Sideways

```text
Wrong:
Bundle A ---> Bundle B internals

Correct:
Bundle A ---> Capability <--- Bundle B
```
