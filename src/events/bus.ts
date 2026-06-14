import type {
  EventBus,
  EventListener,
  GameEvent,
  ProgressionEvent,
  QuestEvent,
} from '../contracts/events.js';

class GamblebotEventBus implements EventBus {
  private readonly gameListeners = new Set<EventListener<GameEvent>>();
  private readonly questListeners = new Set<EventListener<QuestEvent>>();
  private readonly progressionListeners = new Set<EventListener<ProgressionEvent>>();

  onGameEvent(listener: EventListener<GameEvent>): void {
    this.gameListeners.add(listener);
  }

  onQuestEvent(listener: EventListener<QuestEvent>): void {
    this.questListeners.add(listener);
  }

  onProgressionEvent(listener: EventListener<ProgressionEvent>): void {
    this.progressionListeners.add(listener);
  }

  async emitGameEvent(event: GameEvent): Promise<void> {
    await Promise.all([...this.gameListeners].map((listener) => listener(event)));
  }

  async emitQuestEvent(event: QuestEvent): Promise<void> {
    await Promise.all([...this.questListeners].map((listener) => listener(event)));
  }

  async emitProgressionEvent(event: ProgressionEvent): Promise<void> {
    await Promise.all([...this.progressionListeners].map((listener) => listener(event)));
  }
}

export const eventBus = new GamblebotEventBus();
