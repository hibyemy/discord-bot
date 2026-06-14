export type TransactionSource =
  | 'job'
  | 'game_win'
  | 'game_loss'
  | 'game_bet'
  | 'shop'
  | 'daily'
  | 'transfer_in'
  | 'transfer_out'
  | 'transfer_tax'
  | 'quest'
  | 'achievement'
  | 'admin'
  | 'welcome'
  | 'bank_interest'
  | 'deposit'
  | 'withdraw';

export type GameEventType =
  | 'game_played'
  | 'game_won'
  | 'game_lost'
  | 'wager_placed';

export interface GameEvent {
  type: GameEventType;
  discordId: string;
  guildId: string;
  gameType: string;
  bet: number;
  payout: number;
  won: boolean;
  timestamp: Date;
}

export type QuestEventType =
  | 'work'
  | 'game_win'
  | 'game_played'
  | 'wager'
  | 'deposit'
  | 'withdraw'
  | 'pay'
  | 'daily_claim'
  | 'shop_purchase'
  | 'level_up';

export interface QuestEvent {
  type: QuestEventType;
  discordId: string;
  guildId: string;
  amount?: number;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

export type ProgressionEventType = 'xp_awarded' | 'level_up';

export interface ProgressionEvent {
  type: ProgressionEventType;
  discordId: string;
  guildId: string;
  xp: number;
  level: number;
  previousLevel?: number;
  timestamp: Date;
}

export type EconomyEventType =
  | 'transfer'
  | 'daily_claim'
  | 'deposit'
  | 'withdraw';

export interface EconomyEvent {
  type: EconomyEventType;
  discordId: string;
  guildId: string;
  amount: number;
  source: TransactionSource;
  timestamp: Date;
}

export interface EventListener<T> {
  (event: T): void | Promise<void>;
}

export interface EventBus {
  onGameEvent(listener: EventListener<GameEvent>): void;
  onQuestEvent(listener: EventListener<QuestEvent>): void;
  onProgressionEvent(listener: EventListener<ProgressionEvent>): void;
  emitGameEvent(event: GameEvent): Promise<void>;
  emitQuestEvent(event: QuestEvent): Promise<void>;
  emitProgressionEvent(event: ProgressionEvent): Promise<void>;
}
