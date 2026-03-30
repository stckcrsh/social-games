# Suggested Repository Structure

server/
  src/

    core/
      gameState.ts
      weeklyOrchestrator.ts

    managers/
      managerService.ts

    wrestlers/
      wrestlerState.ts
      wrestlerDecisionEngine.ts
      wrestlerMemorySystem.ts

    storyteller/
      showGenerator.ts
      segmentResolver.ts
      matchResolver.ts

    ai/
      promoGenerator.ts
      dialogueAgent.ts
      narrationAgent.ts

    betting/
      bettingService.ts

    persistence/
      database.ts
      schemas/

    api/
      routes/

client/
  manager-ui/
  show-viewer/

data/
  wrestlers.json
  managers.json
  history/

tests/