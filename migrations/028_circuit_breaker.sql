-- Circuit state is now initialized by explicit migrations.
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
