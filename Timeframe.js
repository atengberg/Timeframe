import * as util from 'util';

// Notice clear lack of tests. Use at your own reason (should work, then again, there should be tests to prove this).

/*
 * The trick of money is that it will always convince you it is always ok to use. We can do better as a species.
 */

export const datepochToLegibleArr = function (d, includeISO = false) {
  if (!(d instanceof Date)) d = new Date(d);
  const arr = [d.getTime(), d.toLocaleString()];
  if (includeISO) {
    const [isoDate, isoTime] = d.toISOString().split('T');
    return [...arr, '|iso:', isoDate, isoTime];
  } else {
    return arr;
  }
};

const LOOKUP_TF_TO_SECONDS = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
  w: 604800,
  M: 2592000,
  Y: 31536000,
};
const LOOKUP_TF_TO_MILLISECONDS = Object.fromEntries(Object.entries(LOOKUP_TF_TO_SECONDS).map(([char, seconds]) => [char, seconds * 1000]));

function millisecondsFromTimeframe(timeframe) {
  // Note duplicates of upper and lowercase days, weeks and years but not months (since lower case is always minutes):
  const match = timeframe.match(/^(\d+)([smhdwMY])$/);
  if (!match) throw new Error(`Invalid timeframe format: ${timeframe || 'timeframe DNE'}`);
  const [, quantity, unit] = match;
  return parseInt(quantity, 10) * LOOKUP_TF_TO_MILLISECONDS[unit];
}

function computeCongruentStartKey(interval, epoch = Date.now()) {
  return ~~(epoch / interval) * interval;
}

function computeElapsedCount(interval, startTimestamp, endTimestamp = Date.now()) {
  return ~~((endTimestamp - startTimestamp) / interval);
}

function computeMSLeftUntilNextStart(interval) {
  const now = Date.now();
  const startKey = ~~(now / interval) * interval;
  const next = startKey + interval;
  return next - now;
}

class Timeframe {
  static #memoizCache = Object.create(null);
  static #FALLBACK_FORMAT = 'ms';

  #asLiteral;
  #asMilliseconds;

  constructor(source) {
    if (source instanceof Timeframe) return source;
    if (typeof source === 'string') {
      this.#asLiteral = source;
      this.#asMilliseconds = millisecondsFromTimeframe(source);
    } else if (source?.__isTimeframeSerialized) {
      this.#asLiteral = source.asLiteral;
      this.#asMilliseconds = source.asMilliseconds;
    } else {
      throw new Error(`Invalid timeframe source: ${source}`);
    }
    this.computeElapsedCount = computeElapsedCount.bind(null, this.#asMilliseconds);
    this.computeCongruentStartKey = computeCongruentStartKey.bind(null, this.#asMilliseconds);
  }

  toJSON(asClone = true) {
    return asClone
      ? {
          __isTimeframeSerialized: true,
          asLiteral: this.#asLiteral,
          asMilliseconds: this.#asMilliseconds,
        }
      : { [this.#asLiteral]: this.#asMilliseconds };
  }

  [util.inspect.custom]() {
    return `Timeframe(${this.#asLiteral} = ${this.#asMilliseconds}ms)`;
  }

  // --- Static Constructors ---
  static from(source, options = {}) {
    if (source instanceof Timeframe) return this.#cacheInstance(source);
    const cacheKey = this.#getCacheKey(source, options);
    if (cacheKey && !this.#memoizCache[cacheKey]) {
      this.#memoizCache[cacheKey] = this.#createInstance(source, options);
    }
    return cacheKey ? this.#memoizCache[cacheKey] : this.#createInstance(source, options);
  }

  static fromMilliseconds(ms, options = {}) {
    if (typeof ms !== 'number' || ms < 0) {
      throw new Error(`Reading invalid milliseconds: ${ms} when using Timeframe.fromMs static creator.`);
    }
    // 1. Try exact match
    const exact = this.#findExactMatch(ms);
    if (exact) return exact;
    // 2. Try approximate match (if enabled)
    if (options.approximate) {
      const approx = this.#findApproximateMatch(ms, options.tolerance || 0.1);
      if (approx) return approx;
    }
    // 3. Fallback
    return this.#createFallback(ms, options.format || this.#FALLBACK_FORMAT);
  }

  static #getCacheKey(source, options) {
    if (typeof source === 'string') return source;
    if (source?.__isTimeframeSerialized) return source.asLiteral;
    if (typeof source === 'number') {
      const tf = this.#createInstance(source, options);
      return tf.asLiteral;
    }
  }

  static #createInstance(source, options) {
    if (typeof source === 'string') return new Timeframe(source);
    if (source?.__isTimeframeSerialized) return new Timeframe(source);
    if (typeof source === 'number') return this.fromMilliseconds(source, options);
    throw new Error(`Cannot create from ${typeof source}`);
  }

  static #cacheInstance(tf) {
    const key = tf.asLiteral;
    return this.#memoizCache[key] || (this.#memoizCache[key] = tf);
  }

  static #findExactMatch(ms) {
    for (const [unit, unitMs] of Object.entries(LOOKUP_TF_TO_MILLISECONDS)) {
      if (ms % unitMs === 0) {
        return Timeframe.from(`${ms / unitMs}${unit}`);
      }
    }
    return null;
  }

  static #findApproximateMatch(ms, tolerance) {
    for (const [unit, unitMs] of Object.entries(LOOKUP_TF_TO_MILLISECONDS)) {
      const ratio = ms / unitMs;
      if (Math.abs(ratio - Math.round(ratio)) <= tolerance) {
        return Timeframe.from(`${Math.round(ratio)}${unit}`);
      }
    }
    return null;
  }

  static #createFallback(ms, format) {
    const literal = format === 'seconds' ? `${ms / 1000}s` : `${ms}ms`;
    return new Timeframe({
      __isTimeframeSerialized: true,
      asLiteral: literal,
      asMilliseconds: ms,
    });
  }

  // --- Getters ---
  get asLiteral() {
    return this.#asLiteral;
  }
  get asMilliseconds() {
    return this.#asMilliseconds;
  }
  get millisecondsLeftUntilNextStart() {
    return computeMSLeftUntilNextStart(this.#asMilliseconds);
  }

  // --- Primitive Conversion ---
  [Symbol.toPrimitive](hint) {
    return hint === 'string' ? this.#asLiteral : this.#asMilliseconds;
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const standardTimeframes = [
  '1m',
  '3m',
  '5m',
  '15m',
  '30m',
  '45m',
  '1h',
  '2h',
  '3h',
  '4h',
  '8h',
  '12h',
  '16h',
  '20h',
  '1d',
  '2d',
].map((tfLiteral) => Timeframe.from(tfLiteral));

const tf1m = Timeframe.from('1m');
const tf2m = Timeframe.from('2m');
const tf3m = Timeframe.from('3m');
const tf5m = Timeframe.from('5m');
const tf15m = Timeframe.from('15m');
const tf1h = Timeframe.from('1h');
const tf1d = Timeframe.from('1d');

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function computeTimestampBatches(interval, startTime, endTime, maxLimit = 1441) {
  const totalIntervals = ~~((endTime - startTime) / interval);
  const batches = [];
  for (let i = 0, numBatches = Math.ceil(totalIntervals / maxLimit); i < numBatches; i++) {
    const batchStartTime = startTime + i * maxLimit * interval;
    batches.push({
      startTime: batchStartTime,
      endTime: i === numBatches - 1 ? endTime : batchStartTime + maxLimit * interval - interval,
    });
  }
  return batches;
}

function cloneAndDropLastEndTime(timestampBatches) {
  timestampBatches = [...timestampBatches];
  const length = timestampBatches.length;
  if (length > 0) {
    timestampBatches[length - 1].endTime = undefined;
  }
  return timestampBatches;
}

/**
 * Remember elapsed count will be one less than result data length.
 * Demo:
  ```js
  async function main() {
  const tf = Timeframe.from('1m');
  const dToLegibleArr = (d) => {
    if (!(d instanceof Date)) d = new Date(d);
    return [d.getTime(), d.toLocaleString()];
  };
  const d = new Date();
  d.setUTCMilliseconds(0);
  d.setUTCSeconds(0);
  d.setUTCMinutes(0);
  d.setUTCHours(d.getUTCHours() - 3 * 24);
  const mNow = tf.computeCongruentStartKey();
  const m3DaysAgo = d.getTime();
  const batches = tf.computeTimestampBatches(
    m3DaysAgo,
    mNow,
    1440,
  );
  logStartEndTimes(batches);
  //>
  // #0 | startTime:  1719036000000 6/22/2024, 2:00:00 AM  - endTime:  1719122340000 6/23/2024, 1:59:00 AM && elapsedCount: 1439  
  // #1 | startTime:  1719122400000 6/23/2024, 2:00:00 AM  - endTime:  1719208740000 6/24/2024, 1:59:00 AM && elapsedCount: 1439
  // #2 | startTime:  1719208800000 6/24/2024, 2:00:00 AM  - endTime:  1719295140000 6/25/2024, 1:59:00 && elapsedCount: AM 1439
  // #3 | startTime:  1719295200000 6/25/2024, 2:00:00 AM  - endTime:  1719295800000 6/25/2024, 2:10:00 && elapsedCount: AM 10
  ```
 */
function logStartEndTimes(startEndTimesArr, timeframe = Timeframe.from('1m')) {
  startEndTimesArr
    .map(({ startTime, endTime }, i) => [
      `#${i} | startTime: `,
      ...datepochToLegibleArr(startTime),
      ' - endTime: ',
      ...datepochToLegibleArr(endTime),
      '&& elapsedCount: ',
      timeframe.computeElapsedCount(endTime, startTime),
    ])
    .forEach(([prefix, ...rest]) => console.log(prefix, ...rest));
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export function getCongruentMinuteEpochTimeAgo(
  { days = 0, hours = 0, minutes = 0 } = {},
  { minutes: alignMinutes = false, hours: alignHours = false, days: alignDays = false, months: alignMonths = false } = {},
) {
  // Calculate the target time
  const now = Date.now();
  const msAgo = days * 24 * 60 * 60 * 1000 + hours * 60 * 60 * 1000 + minutes * 60 * 1000;
  let date = new Date(now - msAgo);

  // Reset milliseconds and seconds to 0 (congruent to minutes)
  date.setUTCMilliseconds(0);
  date.setUTCSeconds(0);

  // Apply alignment
  if (alignMinutes) date.setUTCMinutes(0);
  if (alignHours) date.setUTCHours(0);
  if (alignDays) date.setUTCDate(1);
  if (alignMonths) {
    date.setUTCMonth(date.getUTCMonth(), 1);
    date.setUTCHours(0, 0, 0, 0);
  }

  return date.getTime();
}

export function getPrecedingDaysMidnightEpochKey(howManyDaysBack = 7) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - howManyDaysBack);
  d.setUTCMilliseconds(0);
  d.setUTCSeconds(0);
  d.setUTCMinutes(0);
  d.setUTCHours(0);
  return d.getTime();
}

function getEarlierUTCMidnightDate() {
  const now = new Date();
  now.setUTCMilliseconds(0);
  now.setUTCSeconds(0);
  now.setUTCMinutes(0);
  now.setUTCHours(0);
  return now;
}

function getEarlierUTCMidnightDateAsMinuteKey() {
  return getEarlierUTCMidnightDate().getTime();
}

function getPrecedingDaysofMonth() {
  const now = getEarlierUTCMidnightDate();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  return Array.from({ length: now.getUTCDate() })
    .slice(1)
    .map((_, i) => {
      i += 1;
      now.setDate(i);
      const _date = new Date(now);
      return {
        year,
        month,
        day: i,
        epoch: now.getTime(),
        _date,
      };
    });
}

/** Remember month returned is normalized as index starting at 1 (instead of 0). */
function getPrecedingDaysMinuteEpochKeys() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();

  const result = [];
  for (let day = now.getUTCDate() - 1; day > 0; day--) {
    const startOfDay = Date.UTC(year, month, day, 0, 0, 0, 0);
    const endOfDay = Date.UTC(year, month, day, 23, 59, 0, 0);
    const firstEpochKey = computeCongruentStartKey(60000, startOfDay);
    const lastEpochKey = computeCongruentStartKey(60000, endOfDay);
    const nextCheck = new Date(lastEpochKey + 60 * 1000);

    result.push({
      startDate: new Date(firstEpochKey),
      endDate: new Date(lastEpochKey),
      year,
      month: month + 1,
      day,
      epochKeys: [firstEpochKey, lastEpochKey],
      next: {
        epoch: nextCheck.getTime(),
        date: nextCheck,
      },
    });
  }

  return result.reverse();
}

export default Timeframe;
export {
  Timeframe,
  computeCongruentStartKey,
  computeElapsedCount,
  tf1m,
  tf2m,
  tf3m,
  tf5m,
  tf15m,
  tf1h,
  tf1d,
  computeTimestampBatches,
  getEarlierUTCMidnightDate,
  getEarlierUTCMidnightDateAsMinuteKey,
  getPrecedingDaysofMonth,
  logStartEndTimes,
  getPrecedingDaysMinuteEpochKeys,
};
