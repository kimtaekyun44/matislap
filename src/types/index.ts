// 🎮 MetisLap TypeScript Type Definitions

// ========================================
// Enums (Database와 일치)
// ========================================

export enum UserRole {
  MASTER = 'master',
  INSTRUCTOR = 'instructor',
  STUDENT = 'student'
}

export enum ApprovalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected'
}

export enum GameType {
  QUIZ = 'quiz',
  DRAWING = 'drawing',
  LADDER = 'ladder'
}

export enum RoomStatus {
  WAITING = 'waiting',
  IN_PROGRESS = 'in_progress',
  FINISHED = 'finished'
}

// ========================================
// Database Tables Types
// ========================================

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  mustChangePassword: boolean;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface InstructorProfile {
  id: string;
  email: string;
  name: string;
  organization?: string;
  phone?: string;
  approvalStatus: ApprovalStatus;
  approvedAt?: Date;
  approvedBy?: string;
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface GameRoom {
  id: string;
  roomCode: string;
  instructorId: string;
  gameType: GameType;
  roomName: string;
  maxParticipants: number;
  status: RoomStatus;
  gameConfig: Record<string, any>;
  startedAt?: Date;
  endedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  // Relations
  instructor?: InstructorProfile;
  participants?: GameParticipant[];
}

export interface GameParticipant {
  id: string;
  roomId: string;
  nickname: string;
  avatarUrl?: string;
  connectionId?: string;
  isActive: boolean;
  score: number;
  joinedAt: Date;
  leftAt?: Date;
  // Relations
  room?: GameRoom;
}

export interface GameSession {
  id: string;
  roomId: string;
  gameType: GameType;
  gameData: Record<string, any>;
  results: Record<string, any>;
  durationSeconds?: number;
  createdAt: Date;
  // Relations
  room?: GameRoom;
  actions?: GameAction[];
}

export interface GameAction {
  id: string;
  sessionId: string;
  participantId?: string;
  actionType: string;
  actionData: Record<string, any>;
  createdAt: Date;
  // Relations
  session?: GameSession;
  participant?: GameParticipant;
}

export interface SystemLog {
  id: string;
  userId?: string;
  userType?: UserRole;
  action: string;
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

// ========================================
// Auth Types
// ========================================

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface AdminAuthPayload {
  email: string;
  password: string;
}

export interface InstructorAuthPayload {
  email: string;
  password: string;
  name?: string;
  organization?: string;
}

export interface JWTPayload {
  id: string;
  email: string;
  type: 'admin' | 'instructor';
  iat?: number;
  exp?: number;
}

// ========================================
// API Request/Response Types
// ========================================

// Auth
export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  user?: AuthUser;
  token?: string;
  requirePasswordChange?: boolean;
  message?: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  organization?: string;
  phone?: string;
}

export interface RegisterResponse {
  success: boolean;
  message: string;
}

// Room Management
export interface CreateRoomRequest {
  gameType: GameType;
  roomName: string;
  maxParticipants?: number;
  gameConfig?: Record<string, any>;
}

export interface CreateRoomResponse {
  success: boolean;
  room?: GameRoom;
  message?: string;
}

export interface JoinRoomRequest {
  roomCode: string;
  nickname: string;
  avatarUrl?: string;
}

export interface JoinRoomResponse {
  success: boolean;
  participant?: GameParticipant;
  room?: GameRoom;
  message?: string;
}

// Game Actions
export interface GameActionRequest {
  sessionId: string;
  actionType: string;
  actionData: Record<string, any>;
}

export interface GameActionResponse {
  success: boolean;
  action?: GameAction;
  message?: string;
}

// ========================================
// Realtime Event Types
// ========================================

export interface RealtimeEvent {
  type: RealtimeEventType;
  payload: any;
  timestamp: Date;
}

export enum RealtimeEventType {
  // Room events
  PARTICIPANT_JOINED = 'participant_joined',
  PARTICIPANT_LEFT = 'participant_left',
  ROOM_STATUS_CHANGED = 'room_status_changed',
  
  // Game events
  GAME_STARTED = 'game_started',
  GAME_ENDED = 'game_ended',
  GAME_ACTION = 'game_action',
  SCORE_UPDATED = 'score_updated',
  
  // Chat events
  MESSAGE_SENT = 'message_sent',
  REACTION_ADDED = 'reaction_added',
}

export interface ParticipantJoinedPayload {
  participant: GameParticipant;
}

export interface ParticipantLeftPayload {
  participantId: string;
}

export interface RoomStatusChangedPayload {
  roomId: string;
  status: RoomStatus;
}

export interface GameStartedPayload {
  sessionId: string;
  gameType: GameType;
  gameConfig: Record<string, any>;
}

export interface GameEndedPayload {
  sessionId: string;
  results: Record<string, any>;
}

export interface GameActionPayload {
  participantId: string;
  actionType: string;
  actionData: Record<string, any>;
}

export interface ScoreUpdatedPayload {
  participantId: string;
  score: number;
  delta: number;
}

// ========================================
// Game Specific Types
// ========================================

// Quiz Game
export interface QuizQuestion {
  id: string;
  question: string;
  options?: string[];
  correctAnswer: string | number;
  timeLimit?: number;
  points?: number;
}

export interface QuizGameConfig {
  questions: QuizQuestion[];
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  showCorrectAnswer?: boolean;
  allowSkip?: boolean;
}

// Drawing Game
export interface DrawingRound {
  id: string;
  word: string;
  category?: string;
  timeLimit: number;
  hints?: string[];
}

export interface DrawingGameConfig {
  rounds: DrawingRound[];
  drawTime: number;
  guessTime: number;
  maxPoints: number;
}

// Ladder Game
export interface LadderItem {
  id: string;
  room_id: string;
  item_text: string;
  position: number;
  created_at: string;
}

export interface LadderSelection {
  id: string;
  room_id: string;
  participant_id: string;
  start_position: number;
  result_position?: number;
  is_revealed: boolean;
  selected_at: string;
  game_participants?: { nickname: string };
}

export interface LadderData {
  id: string;
  room_id: string;
  lines_count: number;
  horizontal_lines: { row: number; fromCol: number }[];
  created_at: string;
}

export interface LadderGameState {
  ladder_data: LadderData | null;
  selections: LadderSelection[];
  items: LadderItem[];
}

// ========================================
// UI Component Props Types
// ========================================

export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}

export interface CardProps {
  title?: string;
  description?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export interface FormFieldProps {
  label: string;
  name: string;
  type?: 'text' | 'email' | 'password' | 'number' | 'tel';
  placeholder?: string;
  value?: string | number;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error?: string;
  required?: boolean;
  disabled?: boolean;
}

// ========================================
// Store Types (Zustand)
// ========================================

export interface AuthStore {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export interface GameStore {
  currentRoom: GameRoom | null;
  participants: GameParticipant[];
  currentSession: GameSession | null;
  isHost: boolean;
  joinRoom: (roomCode: string, nickname: string) => Promise<void>;
  leaveRoom: () => void;
  startGame: () => Promise<void>;
  endGame: () => Promise<void>;
  sendAction: (action: GameActionRequest) => Promise<void>;
}

export interface UIStore {
  theme: 'light' | 'dark' | 'system';
  sidebarOpen: boolean;
  notifications: Notification[];
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  toggleSidebar: () => void;
  addNotification: (notification: Omit<Notification, 'id'>) => void;
  removeNotification: (id: string) => void;
}

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
}

// ========================================
// Utility Types
// ========================================

export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type AsyncFunction<T = void> = () => Promise<T>;
export type VoidFunction = () => void;

export interface PaginationParams {
  page?: number;
  limit?: number;
  orderBy?: string;
  order?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ========================================
// Error Types
// ========================================

export class AppError extends Error {
  constructor(
    public message: string,
    public code?: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class AuthError extends AppError {
  constructor(message: string, code?: string) {
    super(message, code, 401);
    this.name = 'AuthError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public fields?: Record<string, string>) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
  }
}
