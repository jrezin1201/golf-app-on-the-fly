/**
 * Jounce Reactivity System
 *
 * Fine-grained reactivity inspired by Solid.js
 * Provides Signal, Computed, Effect, and Batch primitives
 *
 * @version 0.4.0-alpha
 * @license MIT
 */

// ============================================================================
// Global Tracking Context
// ============================================================================

/**
 * Currently executing observer (Effect or Computed)
 * When a signal is read, it adds this observer to its subscribers
 */
let currentObserver = null;

/**
 * Batch depth counter for nested batch() calls
 */
let batchDepth = 0;

/**
 * Set of effects queued during batch execution
 */
let batchedEffects = new Set();

// ============================================================================
// Signal Class
// ============================================================================

/**
 * Signal - A reactive container for a single value
 *
 * Signals notify all subscribers (Effects/Computed) when their value changes.
 * Automatically tracks dependencies when read within a tracking scope.
 *
 * @example
 * const count = signal(0);
 * console.log(count.value);  // 0
 * count.value = 5;           // Notifies subscribers
 */
class Signal {
    constructor(initialValue) {
        this._value = initialValue;
        this._subscribers = new Set();
    }

    /**
     * Get current value and track dependency
     */
    get value() {
        // If we're inside an effect or computed, track this signal as a dependency
        if (currentObserver) {
            this._subscribers.add(currentObserver);
            currentObserver._dependencies.add(this);
        }
        return this._value;
    }

    /**
     * Set new value and notify subscribers
     */
    set value(newValue) {
        // Skip notification if value hasn't changed (performance optimization)
        if (Object.is(this._value, newValue)) {
            return;
        }

        this._value = newValue;
        this._notify();
    }

    /**
     * Notify all subscribers of a change
     * @private
     */
    _notify() {
        // Copy subscribers to avoid modification during iteration
        const subscribers = Array.from(this._subscribers);

        for (const subscriber of subscribers) {
            if (batchDepth > 0) {
                // Queue effect for later if we're in a batch
                batchedEffects.add(subscriber);
            } else {
                // Execute immediately
                subscriber._execute();
            }
        }
    }

    /**
     * Remove a subscriber (used during cleanup)
     * @private
     */
    _unsubscribe(observer) {
        this._subscribers.delete(observer);
    }
}

// ============================================================================
// Computed Class
// ============================================================================

/**
 * Computed - A read-only derived signal
 *
 * Automatically recomputes when dependencies change.
 * Lazy evaluation: only runs when .value is accessed.
 * Memoized: caches result until dependencies change.
 *
 * @example
 * const count = signal(0);
 * const doubled = computed(() => count.value * 2);
 * console.log(doubled.value);  // 0
 * count.value = 5;
 * console.log(doubled.value);  // 10
 */
class Computed {
    constructor(computation) {
        this._computation = computation;
        this._value = undefined;
        this._dirty = true;
        this._subscribers = new Set();
        this._dependencies = new Set();
        this._running = false;  // For circular dependency detection
    }

    /**
     * Get current value (recomputes if dirty)
     */
    get value() {
        // Recompute if dependencies have changed
        if (this._dirty) {
            this._recompute();
        }

        // Track this computed as a dependency for the current observer
        if (currentObserver) {
            this._subscribers.add(currentObserver);
            currentObserver._dependencies.add(this);
        }

        return this._value;
    }

    /**
     * No setter - computed values are read-only
     */
    set value(_newValue) {
        throw new Error('Cannot assign to computed value (read-only)');
    }

    /**
     * Recompute the value by running the computation function
     * @private
     */
    _recompute() {
        // Detect circular dependencies
        if (this._running) {
            throw new Error('Circular dependency detected in computed value');
        }

        // Clear old dependencies
        for (const dep of this._dependencies) {
            dep._unsubscribe(this);
        }
        this._dependencies.clear();

        // Run computation and track new dependencies
        this._running = true;
        const prevObserver = currentObserver;
        currentObserver = this;

        try {
            this._value = this._computation();
        } finally {
            currentObserver = prevObserver;
            this._running = false;
        }

        this._dirty = false;
    }

    /**
     * Mark as dirty and notify subscribers
     * Called when a dependency changes
     * @private
     */
    _execute() {
        this._dirty = true;
        this._notify();
    }

    /**
     * Notify all subscribers that this computed has changed
     * @private
     */
    _notify() {
        // Copy subscribers to avoid modification during iteration
        const subscribers = Array.from(this._subscribers);

        for (const subscriber of subscribers) {
            if (batchDepth > 0) {
                batchedEffects.add(subscriber);
            } else {
                subscriber._execute();
            }
        }
    }

    /**
     * Remove a subscriber
     * @private
     */
    _unsubscribe(observer) {
        this._subscribers.delete(observer);
    }
}

// ============================================================================
// Effect Class
// ============================================================================

/**
 * Effect - A side-effect that re-runs when dependencies change
 *
 * Runs immediately on creation and re-runs whenever any tracked
 * signal or computed value changes.
 *
 * @example
 * const count = signal(0);
 * effect(() => {
 *     console.log('Count:', count.value);
 * });
 * // Logs: "Count: 0"
 * count.value = 5;
 * // Logs: "Count: 5"
 */
class Effect {
    constructor(fn, options = {}) {
        this._fn = fn;
        this._dependencies = new Set();
        this._running = false;  // For circular dependency detection
        this._disposed = false;

        // Run immediately (unless deferred)
        if (!options.defer) {
            this._execute();
        }
    }

    /**
     * Execute the effect function and track dependencies
     * @private
     */
    _execute() {
        if (this._disposed) {
            return;
        }

        // Detect circular dependencies
        if (this._running) {
            throw new Error('Circular dependency detected in effect');
        }

        // Clear old dependencies
        for (const dep of this._dependencies) {
            dep._unsubscribe(this);
        }
        this._dependencies.clear();

        // Run effect and track new dependencies
        this._running = true;
        const prevObserver = currentObserver;
        currentObserver = this;

        try {
            this._fn();
        } finally {
            currentObserver = prevObserver;
            this._running = false;
        }
    }

    /**
     * Dispose of this effect (stop tracking dependencies)
     * Useful for cleanup when effect is no longer needed
     */
    dispose() {
        if (this._disposed) {
            return;
        }

        this._disposed = true;

        // Unsubscribe from all dependencies
        for (const dep of this._dependencies) {
            dep._unsubscribe(this);
        }
        this._dependencies.clear();
    }
}

// ============================================================================
// Batch Function
// ============================================================================

/**
 * Batch - Defer effect execution until all updates are complete
 *
 * Prevents redundant effect executions when multiple signals change.
 * All effects run once at the end with all updates visible.
 *
 * @example
 * const firstName = signal('John');
 * const lastName = signal('Doe');
 *
 * effect(() => {
 *     console.log(firstName.value, lastName.value);
 * });
 * // Logs: "John Doe"
 *
 * batch(() => {
 *     firstName.value = 'Jane';
 *     lastName.value = 'Smith';
 * });
 * // Logs: "Jane Smith" (only once, not twice)
 *
 * @param {Function} fn - Function to execute in batch mode
 * @returns {*} Return value of fn
 */
function batch(fn) {
    batchDepth++;

    try {
        return fn();
    } finally {
        batchDepth--;

        // If we've exited all batch scopes, run queued effects
        if (batchDepth === 0) {
            const effects = Array.from(batchedEffects);
            batchedEffects.clear();

            for (const effect of effects) {
                effect._execute();
            }
        }
    }
}

// ============================================================================
// Untrack Function
// ============================================================================

/**
 * Untrack - Read signals without tracking dependencies
 *
 * Useful when you want to read a signal value inside an effect
 * but don't want the effect to re-run when that signal changes.
 *
 * @example
 * const count = signal(0);
 * const other = signal(100);
 *
 * effect(() => {
 *     console.log('Count:', count.value);
 *
 *     // Read other without tracking
 *     untrack(() => {
 *         console.log('Other:', other.value);
 *     });
 * });
 * // Logs: "Count: 0" and "Other: 100"
 *
 * other.value = 200;  // Effect does NOT re-run
 * count.value = 1;    // Effect DOES re-run
 *
 * @param {Function} fn - Function to execute without tracking
 * @returns {*} Return value of fn
 */
function untrack(fn) {
    const prevObserver = currentObserver;
    currentObserver = null;

    try {
        return fn();
    } finally {
        currentObserver = prevObserver;
    }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Create a new signal with an initial value
 *
 * @param {*} initialValue - Initial value for the signal
 * @returns {Signal} A new signal instance
 */
function signal(initialValue) {
    return new Signal(initialValue);
}

/**
 * Create a persistent signal that syncs with localStorage
 *
 * The signal will automatically:
 * - Load initial value from localStorage (if exists)
 * - Save to localStorage on every update
 * - Handle JSON serialization/deserialization
 *
 * @param {string} key - localStorage key
 * @param {*} defaultValue - Default value if nothing in localStorage
 * @returns {Signal} A new signal instance with localStorage persistence
 *
 * @example
 * const count = persistentSignal('counter', 0);
 * count.value = 5;  // Saves to localStorage['counter']
 * // On page reload: count.value === 5
 */
function persistentSignal(key, defaultValue) {
    // Try to load from localStorage
    let initialValue = defaultValue;
    if (typeof localStorage !== 'undefined') {
        try {
            const stored = localStorage.getItem(key);
            if (stored !== null) {
                initialValue = JSON.parse(stored);
            }
        } catch (e) {
            console.warn(`Failed to load persistent signal '${key}':`, e);
        }
    }

    // Create regular signal with loaded/default value
    const sig = new Signal(initialValue);

    // Wrap the setter to save to localStorage
    const originalSet = Object.getOwnPropertyDescriptor(Signal.prototype, 'value').set;
    Object.defineProperty(sig, 'value', {
        get() {
            // Use original getter
            return Object.getOwnPropertyDescriptor(Signal.prototype, 'value').get.call(this);
        },
        set(newValue) {
            // Call original setter
            originalSet.call(this, newValue);

            // Save to localStorage after update
            if (typeof localStorage !== 'undefined') {
                try {
                    localStorage.setItem(key, JSON.stringify(newValue));
                } catch (e) {
                    console.warn(`Failed to save persistent signal '${key}':`, e);
                }
            }
        }
    });

    return sig;
}

/**
 * Create a computed value from a computation function
 *
 * @param {Function} computation - Zero-argument function that returns a value
 * @returns {Computed} A new computed instance
 */
function computed(computation) {
    if (typeof computation !== 'function') {
        throw new TypeError('computed() requires a function');
    }
    return new Computed(computation);
}

/**
 * Create an effect that runs when dependencies change
 *
 * @param {Function} fn - Zero-argument function to run
 * @param {Object} options - Optional configuration
 * @param {boolean} options.defer - If true, don't run immediately
 * @returns {Effect} A new effect instance (call .dispose() to stop tracking)
 */
function effect(fn, options) {
    if (typeof fn !== 'function') {
        throw new TypeError('effect() requires a function');
    }
    return new Effect(fn, options);
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Get the current number of subscribers for a signal/computed (for debugging)
 * @private
 */
function getSubscriberCount(reactive) {
    return reactive._subscribers.size;
}

/**
 * Get the current number of dependencies for an effect/computed (for debugging)
 * @private
 */
function getDependencyCount(observer) {
    return observer._dependencies.size;
}

// ============================================================================
// Exports
// ============================================================================

// CommonJS (Node.js)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        signal,
        persistentSignal,
        computed,
        effect,
        batch,
        untrack,
        // Private exports for testing
        _internals: {
            Signal,
            Computed,
            Effect,
            getSubscriberCount,
            getDependencyCount,
        }
    };
}

// ES Module
if (typeof exports !== 'undefined') {
    exports.signal = signal;
    exports.persistentSignal = persistentSignal;
    exports.computed = computed;
    exports.effect = effect;
    exports.batch = batch;
    exports.untrack = untrack;
}

// Global (Browser)
if (typeof window !== 'undefined') {
    window.JounceReactivity = {
        signal,
        persistentSignal,
        computed,
        effect,
        batch,
        untrack,
    };
}

// ES6 exports for browser modules
export { signal, persistentSignal, computed, effect, batch, untrack };
