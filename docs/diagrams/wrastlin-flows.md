# Wrastlin Flow Diagrams

---

## 1. Weekly Game Loop — State Machine

The game advances through three phases each week. Only one transition is possible at a time.

```mermaid
stateDiagram-v2
    direction LR

    [*] --> week_open : game starts (week 1)

    week_open --> submissions_closed : admin closes submissions\nPOST /state/close-submissions

    submissions_closed --> show_generated : admin runs show generator\npnpm nx run wrastlin-service:generate-show

    show_generated --> week_open : admin advances week\nPOST /state/advance-week\n(currentWeek + 1)

    note right of week_open
        Managers can:
        - Chat with their wrestler
        - Submit weekly guidance
        - Submit story requests
    end note

    note right of submissions_closed
        No more submissions accepted.
        Show generation can now run.
    end note

    note right of show_generated
        Show results saved to
        data/shows/week-N.json.
        Wrestler emotions updated.
    end note
```

---

## 2. Weekly Game Loop — Full Actor Flow

Who does what, in what order, across a full week.

```mermaid
sequenceDiagram
    actor M as Manager
    participant UI as Manager UI<br/>(port 4300)
    participant API as Game Server<br/>(port 3002)
    participant FS as Data Files<br/>(JSON)
    actor A as Admin

    rect rgb(230, 245, 255)
        note over M,FS: Phase: week_open

        M->>UI: Open wrestler dashboard
        UI->>API: GET /managers/m-001
        API->>FS: read managers.json
        FS-->>API: manager record
        UI->>API: GET /wrestlers/w-002
        API->>FS: read wrestlers.json
        FS-->>API: wrestler record
        API-->>UI: wrestler + manager data
        UI-->>M: wrestler card + chat panel

        loop Manager chats (0 or more times)
            M->>UI: types message
            UI->>API: POST /managers/m-001/chat
            API-->>UI: wrestler response (mock/AI)
            UI-->>M: response bubble
        end

        M->>UI: fill out submission form
        note right of M: match style, target,<br/>story request, bribe
        UI->>API: POST /submissions
        API->>FS: write submissions/week-1.json
        API-->>UI: 201 submission confirmed
        UI-->>M: "Submission recorded!"
    end

    rect rgb(255, 245, 230)
        note over A,FS: Phase transition: week_open → submissions_closed

        A->>API: POST /state/close-submissions
        API->>FS: update state.json → submissions_closed
        API-->>A: updated state
    end

    rect rgb(240, 255, 240)
        note over A,FS: Show generation (CLI job)

        A->>API: pnpm nx run wrastlin-service:generate-show
        note right of A: reads data files directly,<br/>not via HTTP
        API->>FS: read wrestlers.json
        API->>FS: read submissions/week-1.json
        API->>FS: read state.json
        API->>API: generate show (see Show Pipeline diagram)
        API->>FS: write shows/week-1.json
        API->>FS: update wrestlers.json (emotions)
        API->>FS: update state.json → show_generated
        API-->>A: show printed to terminal
    end

    rect rgb(255, 230, 255)
        note over A,FS: Phase transition: show_generated → week_open

        A->>API: POST /state/advance-week
        API->>FS: update state.json → week_open, week 2
        API-->>A: week 2 open
    end
```

---

## 3. Show Generation Pipeline

What happens inside `generateShow()` when the CLI script runs.

```mermaid
flowchart TD
    START([CLI: generate-show.ts]) --> GUARD{phase ==\nsubmissions_closed?}
    GUARD -- no --> ERR([exit with error])
    GUARD -- yes --> LOAD

    LOAD["① Load world state
    • wrestlers.json
    • submissions/week-N.json
    • state.json"]

    LOAD --> PROMO

    PROMO["② Opening promo
    Pick highest-charisma wrestler
    Add opening-promo segment"]

    PROMO --> SORT

    SORT["③ Sort wrestlers by total stats
    Reserve top 2 for main event
    Pair remaining for mid-card"]

    SORT --> MIDCARD

    subgraph MIDCARD ["④ Mid-card matches (for each pair)"]
        direction TB
        CHECK{submission requests\nfeud for this pair?}
        CHECK -- yes --> FEUD["rivalryHeat = 7"]
        CHECK -- no --> NONE["rivalryHeat = 0"]
        FEUD --> RESOLVE
        NONE --> RESOLVE
        RESOLVE["resolveMatch(a, b, ctx)
        → MatchResult"]
        RESOLVE --> ADDSEG["Add singles-match segment"]
    end

    MIDCARD --> MAIN

    MAIN["⑤ Main event
    resolveMatch(top1, top2, { rivalryHeat: 5 })
    Add main-event segment"]

    MAIN --> NARRATE

    NARRATE["⑥ Narration
    Template strings per segment type
    (AI generation: future)"]

    NARRATE --> UPDATE

    UPDATE["⑦ Post-show state updates
    Winners: confidence +1, frustration -1
    Losers: confidence -1, frustration +1
    saveWrestlers(updatedWrestlers)"]

    UPDATE --> SAVE

    SAVE["⑧ Persist results
    writeJson shows/week-N.json
    transitionTo('show_generated')"]

    SAVE --> PRINT["Print show card to terminal"]
    PRINT --> DONE([Done])
```

---

## 4. Match Resolution — Decision Logic

How a single match outcome is determined (fully deterministic).

```mermaid
flowchart TD
    INPUT["Inputs
    Wrestler A + Wrestler B
    MatchContext (rivalryHeat, managerAdviceTarget)"]

    INPUT --> SCORE

    subgraph SCORE ["Score each wrestler"]
        direction LR
        SA["score(A) =
        avg(stats) +
        (confidence - fatigue) × 2 -
        frustration × 1.5"]
        SB["score(B) =
        same formula"]
    end

    SCORE --> ROLL["Roll random(0 … scoreA + scoreB)"]

    ROLL --> WIN{result < scoreA?}
    WIN -- yes --> WA["Winner = A"]
    WIN -- no --> WB["Winner = B"]

    WA & WB --> FINISH

    subgraph FINISH ["Pick finish type"]
        direction TB
        F1{rivalryHeat ≥ 8\nand rand < 0.3?}
        F1 -- yes --> DQ["dq"]
        F1 -- no --> F2{honor ≤ 3\nand rand < 0.35?}
        F2 -- yes --> DIRTY["dirty"]
        F2 -- no --> F3{anger ≥ 8\nand rand < 0.2?}
        F3 -- yes --> COUNTOUT["count-out"]
        F3 -- no --> CLEAN["clean"]
    end

    FINISH --> CROWD

    subgraph CROWD ["Crowd reaction"]
        direction TB
        EXCITEMENT["excitement =
        charisma/100 + rivalryHeat/10"]
        EXCITEMENT --> C1{DQ or\nno-contest?}
        C1 -- yes --> LUKEWARM["lukewarm"]
        C1 -- no --> C2{excitement\n> 0.7?}
        C2 -- yes --> HOT["hot"]
        C2 -- no --> C3{excitement\n> 0.4?}
        C3 -- yes --> LUKEWARM2["lukewarm"]
        C3 -- no --> DEAD["dead"]
    end

    CROWD --> RESULT["MatchResult
    { winner, finishType, crowdReaction,
      moments[], narration }"]
```

---

## 5. Data Flow — What Files Exist and Who Reads/Writes Them

```mermaid
flowchart LR
    subgraph FILES ["data/ (JSON flat files)"]
        WJ[wrestlers.json]
        MJ[managers.json]
        SJ[state.json]
        SUB["submissions/week-N.json"]
        SHOW["shows/week-N.json"]
    end

    subgraph API ["Game Server (port 3002)"]
        WR["/wrestlers routes"]
        MR["/managers routes\n(chat)"]
        SR["/submissions routes"]
        STR["/state routes"]
    end

    subgraph CLI ["CLI Job"]
        GS["generate-show.ts"]
    end

    subgraph UI ["Manager UI (port 4300)"]
        DASH["WrestlerDashboard"]
        FORM["SubmissionForm"]
    end

    DASH -->|GET /wrestlers/:id\nGET /managers/:id| WR & MR
    DASH -->|POST /managers/:id/chat| MR
    FORM -->|POST /submissions| SR

    WR -->|read| WJ
    MR -->|read| WJ & MJ
    SR -->|read/write| SUB
    SR -->|read| SJ
    STR -->|read/write| SJ

    GS -->|read| WJ & MJ & SUB & SJ
    GS -->|write| SHOW
    GS -->|write emotions| WJ
    GS -->|write| SJ
```

---

## 6. AI Show Generation Pipeline — `runShowPipeline`

What happens inside `runShowPipeline()` — the replacement for the old deterministic `generateShow()`. Three async steps; steps 2 and 3 are fully parallel across segments.

```mermaid
flowchart TD
    INPUT["Inputs
    showOutlineInput, wrestlers, managers,
    submissions, announcers, agents ×4"]

    INPUT --> STEP1

    STEP1["① ShowOutline agent
    agents.showOutline(showOutlineInput)
    → ShowOutline { segments[] }
    (each segment: type 'match' | 'promo')"]

    STEP1 --> STEP2

    subgraph STEP2 ["② Promise.all — one task per segment"]
        direction LR
        SEG_M["Segment type == 'match'
        buildMatchBeatsInput(segment, wrestlers,
          managers, submissions)
        → agents.matchBeats(input)
        → MatchBeats"]

        SEG_P["Segment type == 'promo'
        buildPromoScreenplayInput(segment,
          wrestlers, week, announcers)
        → agents.promoScreenplay(input)
        → PromoScreenplay"]
    end

    STEP2 --> STEP3

    subgraph STEP3 ["③ Promise.all — one task per SegmentResult"]
        direction LR
        ANN["SegmentResult type == 'match'
        buildAnnouncerScreenplayInput(beats, announcers)
        → agents.announcerScreenplay(input)
        → GeneratedMatchSegment
        { ...segment, beats, announcerScreenplay }"]

        PROMO_PASS["SegmentResult type == 'promo'
        (no announcer needed)
        → GeneratedPromoSegment
        { ...segment, promoScreenplay }"]
    end

    STEP3 --> SORT["Sort segments by order field"]
    SORT --> OUT["GeneratedShow
    { showOutline, segments: GeneratedSegment[] }"]
```

---

## 7. Agent Architecture — Prompts, Inputs, and Dependency Injection

How each AI agent is wired: prompt templates on disk, data builders transform raw game data into structured inputs, and the `agents` object is injected so stubs can replace real AI calls in tests.

```mermaid
flowchart TD
    subgraph DISK ["prompts/ (Markdown files)"]
        P1["show-outline.md
        {{WEEK}}, {{WRESTLERS}},
        {{SUBMISSIONS}}, {{PREVIOUS_OUTLINES}}"]
        P2["match-beats.md
        {{SEGMENT}}, {{WRESTLERS}}"]
        P3["promo-screenplay.md
        {{SEGMENT}}, {{PARTICIPANTS}},
        {{TARGET}}, {{PERSONAS}}"]
        P4["announcer-screenplay.md
        {{MATCH_BEATS}}, {{ANNOUNCERS}}"]
    end

    subgraph LOADER ["promptLoader.ts"]
        LD["loadPrompt(filename, variables)
        • reads PROMPTS_DIR env var (or default path)
        • reads template file
        • replaces {{PLACEHOLDERS}}
        → filled prompt string"]
    end

    subgraph BUILDERS ["dataBuilders.ts"]
        B1["buildShowOutlineInput(week, wrestlers,
          managers, submissions, previousOutlines)
        → ShowOutlineInput"]
        B2["buildMatchBeatsInput(segment, wrestlers,
          managers, submissions)
        → MatchBeatsInput"]
        B3["buildPromoScreenplayInput(segment,
          wrestlers, week, announcers)
        → PromoScreenplayInput"]
        B4["buildAnnouncerScreenplayInput(beats,
          announcers)
        → AnnouncerScreenplayInput"]
        B5["computeRivalryHeat(wrestlers, idA, idB)
        (hatred[A→B] + hatred[B→A]) / 2
        → number 0–10"]
    end

    subgraph AGENTS ["Agent function types (types.ts)"]
        A1["ShowOutlineAgentFn
        (input: ShowOutlineInput) → Promise<ShowOutline>"]
        A2["MatchBeatsAgentFn
        (input: MatchBeatsInput) → Promise<MatchBeats>"]
        A3["PromoScreenplayAgentFn
        (input: PromoScreenplayInput) → Promise<PromoScreenplay>"]
        A4["AnnouncerScreenplayAgentFn
        (input: AnnouncerScreenplayInput) → Promise<AnnouncerScreenplay>"]
    end

    subgraph IMPLS ["Implementations (injected at runtime)"]
        REAL["Real AI agents
        loadPrompt() + call Claude API"]
        STUB["Stub agents (stubs/)
        return hardcoded valid fixtures
        used in pipeline.spec.ts"]
    end

    P1 & P2 & P3 & P4 --> LD
    B1 --> A1
    B2 --> A2
    B3 --> A3
    B4 --> A4
    LD -.->|prompt string| REAL
    REAL --> A1 & A2 & A3 & A4
    STUB --> A1 & A2 & A3 & A4
```
