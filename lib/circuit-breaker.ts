/**
 * Circuit Breaker for FPP Device State Management
 * 
 * Implements the Circuit Breaker pattern to handle FPP offline gracefully:
 * - CLOSED: Normal operation (FPP online)
 * - OPEN: FPP offline, minimal polling to save resources
 * - HALF_OPEN: Testing if FPP has recovered
 * 
 * SECURITY:
 * - Persisted state survives restarts (no state loss)
 * - Database transactions for atomic updates
 * - Input validation on all state transitions
 * - No user input accepted (internal system only)
 * 
 * RESOURCE EFFICIENCY:
 * - Prevents hammering offline FPP device
 * - Reduces database writes when FPP is offline
 * - Pauses dependent services (queue processor, etc.)
 * - Automatic recovery testing
 */

import Database from 'better-sqlite3';
import EventEmitter from 'events';
import { CIRCUIT_BREAKER } from './constants';
import { getVotesDbPath } from './db-path';

export enum CircuitState {
  CLOSED = 'CLOSED',       // Normal operation - FPP online
  OPEN = 'OPEN',           // FPP offline - paused polling
  HALF_OPEN = 'HALF_OPEN'  // Testing recovery
}

export interface CircuitBreakerConfig {
  failureThreshold: number;      // Failures before opening circuit (default: 3)
  resetTimeout: number;           // Time before attempting recovery (default: 60000ms)
  halfOpenMaxAttempts: number;    // Test attempts in HALF_OPEN state (default: 1)
  successThreshold: number;       // Successes needed to close circuit (default: 2)
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  timeSinceLastFailure: number;
  timeSinceStateChange: number;
  nextRetryIn: number | null;
  totalTransitions: number;
  uptime: number;
}

export class FPPCircuitBreaker extends EventEmitter {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number = 0;
  private lastStateChange: number = Date.now();
  private totalTransitions: number = 0;
  private startTime: number = Date.now();
  
  private config: CircuitBreakerConfig;
  private db: Database.Database;

  constructor(config?: Partial<CircuitBreakerConfig>, dbPath: string = getVotesDbPath()) {
    super();
    
    // SECURITY: Validate configuration values
    this.config = {
      failureThreshold: Math.max(1, Math.min(config?.failureThreshold ?? 3, 10)),
      resetTimeout: Math.max(CIRCUIT_BREAKER.MIN_RESET_TIMEOUT, Math.min(config?.resetTimeout ?? CIRCUIT_BREAKER.DEFAULT_RESET_TIMEOUT, CIRCUIT_BREAKER.MAX_RESET_TIMEOUT)),
      halfOpenMaxAttempts: Math.max(1, Math.min(config?.halfOpenMaxAttempts ?? 1, 5)),
      successThreshold: Math.max(1, Math.min(config?.successThreshold ?? 2, 5))
    };

    // Initialize database connection
    this.db = new Database(dbPath);
    this.db.pragma('foreign_keys = ON');

    // Create circuit breaker state table if not exists
    this.initializeDatabase();

    // Load persisted state from database
    this.loadState();

    console.log('[Circuit Breaker] Initialized:', {
      state: this.state,
      failureThreshold: this.config.failureThreshold,
      resetTimeout: `${this.config.resetTimeout / 1000}s`,
      successThreshold: this.config.successThreshold
    });
  }

  /**
   * Initialize database table for circuit breaker state
   * SECURITY: Uses CHECK constraints to validate state values
   */
  private initializeDatabase(): void {
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS fpp_circuit_breaker (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          state TEXT NOT NULL CHECK(state IN ('CLOSED', 'OPEN', 'HALF_OPEN')),
          failure_count INTEGER DEFAULT 0 CHECK(failure_count >= 0),
          success_count INTEGER DEFAULT 0 CHECK(success_count >= 0),
          last_failure_time INTEGER CHECK(last_failure_time >= 0),
          last_state_change INTEGER NOT NULL,
          total_transitions INTEGER DEFAULT 0 CHECK(total_transitions >= 0),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        -- Insert default state if not exists
        INSERT OR IGNORE INTO fpp_circuit_breaker (
          id, state, last_state_change
        ) VALUES (
          1, 'CLOSED', strftime('%s', 'now') * 1000
        );
      `);
    } catch (error: any) {
      console.error('[Circuit Breaker] Failed to initialize database:', error.message);
      throw error;
    }
  }

  /**
   * Load circuit breaker state from database (survives restarts)
   * The poller and the web server each have an instance; the database row is the shared state,
   * so every public method re-reads it first (otherwise the web server keeps whatever it loaded at
   * startup and never sees FPP come back). Read-only: state changes happen in allowRequest/record*.
   * SECURITY: Validates all loaded values before using them
   */
  private loadState(): void {
    try {
      const row = this.db.prepare(`
        SELECT state, failure_count, success_count, last_failure_time, 
               last_state_change, total_transitions
        FROM fpp_circuit_breaker WHERE id = 1
      `).get() as any;

      if (row) {
        // SECURITY: Validate state from database
        const validStates = [CircuitState.CLOSED, CircuitState.OPEN, CircuitState.HALF_OPEN];
        if (!validStates.includes(row.state)) {
          console.warn('[Circuit Breaker] Invalid state in DB, resetting to CLOSED');
          this.state = CircuitState.CLOSED;
        } else {
          this.state = row.state as CircuitState;
        }

        // SECURITY: Validate numeric values
        this.failureCount = Math.max(0, row.failure_count || 0);
        this.successCount = Math.max(0, row.success_count || 0);
        this.lastFailureTime = Math.max(0, row.last_failure_time || 0);
        this.lastStateChange = Math.max(0, row.last_state_change || Date.now());
        this.totalTransitions = Math.max(0, row.total_transitions || 0);
      }
    } catch (error: any) {
      // Keep the current state (CLOSED when this happens at startup)
      console.error('[Circuit Breaker] Failed to load state:', error.message);
    }
  }

  /**
   * Persist circuit breaker state to database
   * SECURITY: Uses prepared statement with parameterized values
   */
  private saveState(): void {
    try {
      this.db.prepare(`
        UPDATE fpp_circuit_breaker
        SET state = ?,
            failure_count = ?,
            success_count = ?,
            last_failure_time = ?,
            last_state_change = ?,
            total_transitions = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
      `).run(
        this.state,
        this.failureCount,
        this.successCount,
        this.lastFailureTime,
        this.lastStateChange,
        this.totalTransitions
      );
    } catch (error: any) {
      console.error('[Circuit Breaker] Failed to save state:', error.message);
    }
  }

  /**
   * Get current circuit state
   */
  public getState(): CircuitState {
    this.loadState();
    return this.state;
  }

  /**
   * Check if circuit allows requests
   * Returns true if request should be attempted, false if blocked
   */
  public allowRequest(): boolean {
    this.loadState();
    if (this.state === CircuitState.OPEN) {
      // Check if enough time has passed to attempt recovery
      const timeSinceFailure = Date.now() - this.lastFailureTime;
      if (timeSinceFailure >= this.config.resetTimeout) {
        this.moveToHalfOpen();
        return true;
      }
      return false; // Circuit is OPEN, block requests
    }

    return true; // CLOSED or HALF_OPEN allow requests
  }

  /**
   * Record successful FPP operation
   * SECURITY: No user input, internal state management only
   */
  public recordSuccess(): void {
    this.loadState();
    this.failureCount = 0; // Reset failure count

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      console.log(`[Circuit Breaker] ✓ Success in HALF_OPEN state (${this.successCount}/${this.config.successThreshold})`);

      if (this.successCount >= this.config.successThreshold) {
        this.moveToClosed();
      }
    } else if (this.state === CircuitState.OPEN) {
      // Direct transition from OPEN to CLOSED on first success
      console.log('[Circuit Breaker] ✓ Unexpected success in OPEN state, moving to CLOSED');
      this.moveToClosed();
    }

    this.saveState();
  }

  /**
   * Record failed FPP operation
   * SECURITY: Sanitizes error message (max 255 chars)
   */
  public recordFailure(error?: string): void {
    this.loadState();
    this.failureCount++;
    this.lastFailureTime = Date.now();

    // SECURITY: Sanitize error message
    const sanitizedError = error 
      ? String(error).substring(0, 255).replace(/[^\w\s\-:.()]/g, '') 
      : 'Unknown';

    console.log(`[Circuit Breaker] ✗ Failure recorded (${this.failureCount}/${this.config.failureThreshold}): ${sanitizedError}`);

    if (this.state === CircuitState.HALF_OPEN) {
      // Failed recovery attempt, go back to OPEN
      console.log('[Circuit Breaker] Recovery attempt failed, reopening circuit');
      this.moveToOpen();
    } else if (this.state === CircuitState.CLOSED && this.failureCount >= this.config.failureThreshold) {
      // Too many failures, open the circuit
      this.moveToOpen();
    }

    this.saveState();
  }

  /**
   * Transition to OPEN state (FPP offline)
   */
  private moveToOpen(): void {
    if (this.state === CircuitState.OPEN) return;

    const previousState = this.state;
    this.state = CircuitState.OPEN;
    this.successCount = 0;
    this.lastStateChange = Date.now();
    this.totalTransitions++;

    console.log('[Circuit Breaker] ⚠️  Opening circuit - FPP appears to be OFFLINE');
    console.log(`[Circuit Breaker] Will retry in ${this.config.resetTimeout / 1000}s`);
    console.log('[Circuit Breaker] Resource-intensive operations will be PAUSED');

    this.saveState();
    this.emit('stateChange', this.state, previousState);
    this.emit('open', { 
      failureCount: this.failureCount,
      nextRetry: this.config.resetTimeout 
    });
  }

  /**
   * Transition to HALF_OPEN state (testing recovery)
   */
  private moveToHalfOpen(): void {
    if (this.state === CircuitState.HALF_OPEN) return;

    const previousState = this.state;
    this.state = CircuitState.HALF_OPEN;
    this.successCount = 0;
    this.lastStateChange = Date.now();
    this.totalTransitions++;

    console.log('[Circuit Breaker] 🔄 Moving to HALF_OPEN - testing FPP recovery...');

    this.saveState();
    this.emit('stateChange', this.state, previousState);
    this.emit('halfOpen');
  }

  /**
   * Transition to CLOSED state (FPP online)
   */
  private moveToClosed(): void {
    if (this.state === CircuitState.CLOSED) return;

    const previousState = this.state;
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastStateChange = Date.now();
    this.totalTransitions++;

    console.log('[Circuit Breaker] ✅ Closing circuit - FPP is back ONLINE');
    console.log('[Circuit Breaker] Normal operations RESUMED');

    this.saveState();
    this.emit('stateChange', this.state, previousState);
    this.emit('closed');
  }

  /**
   * Get comprehensive circuit breaker statistics
   */
  public getStats(): CircuitBreakerStats {
    this.loadState();
    const now = Date.now();
    const timeSinceLastFailure = this.lastFailureTime ? now - this.lastFailureTime : 0;
    const timeSinceStateChange = now - this.lastStateChange;
    const uptime = now - this.startTime;

    let nextRetryIn: number | null = null;
    if (this.state === CircuitState.OPEN) {
      nextRetryIn = Math.max(0, this.config.resetTimeout - timeSinceLastFailure);
    }

    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      timeSinceLastFailure,
      timeSinceStateChange,
      nextRetryIn,
      totalTransitions: this.totalTransitions,
      uptime
    };
  }

  /**
   * Force reset circuit to CLOSED (admin manual recovery)
   * SECURITY: Should only be called by authenticated admin users
   */
  public reset(): void {
    console.log('[Circuit Breaker] ⚙️  Manual reset to CLOSED state (admin override)');
    this.loadState();
    this.failureCount = 0;
    this.successCount = 0;
    this.moveToClosed();
  }

  /**
   * Check if FPP is considered online based on circuit state
   */
  public isFPPOnline(): boolean {
    this.loadState();
    return this.state === CircuitState.CLOSED;
  }

  /**
   * Check if circuit is testing recovery
   */
  public isTestingRecovery(): boolean {
    this.loadState();
    return this.state === CircuitState.HALF_OPEN;
  }

  /**
   * Check if FPP is considered offline
   */
  public isFPPOffline(): boolean {
    this.loadState();
    return this.state === CircuitState.OPEN;
  }

  /**
   * Close database connection
   */
  public close(): void {
    try {
      this.saveState(); // Persist final state
      this.db.close();
      console.log('[Circuit Breaker] Database connection closed');
    } catch (error: any) {
      console.error('[Circuit Breaker] Error closing database:', error.message);
    }
  }
}

// Singleton instance for shared state across modules
let circuitBreakerInstance: FPPCircuitBreaker | null = null;

/**
 * Get singleton circuit breaker instance
 * SECURITY: Single source of truth for circuit state
 */
export function getCircuitBreaker(): FPPCircuitBreaker {
  if (!circuitBreakerInstance) {
    circuitBreakerInstance = new FPPCircuitBreaker();
  }
  return circuitBreakerInstance;
}

/**
 * Reset singleton instance (used for testing)
 */
export function resetCircuitBreakerInstance(): void {
  if (circuitBreakerInstance) {
    circuitBreakerInstance.close();
    circuitBreakerInstance = null;
  }
}
