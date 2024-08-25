import * as util from 'util';

// Notice clear lack of tests. Use at your own reason (should work, then again, there should be tests to prove this).

/*
 * The trick of money is that it will always convince you it is always ok to use. We can do better as a species.
 */

/**
 * Utility class for handling Timeframeness.
 * Class caches unique timeframe's when using static from 'constructor'.
 * Demo:
 * ```
    import { strict as assert } from 'node:assert';
    import { setTimeout as sleep } from 'timers/promises';
    import Timeframe, { tf3m } from './Timeframe2.js';

    const tf1 = Timeframe.from('1m');
    console.log(tf1);

    assert.equal(tf3m.asMilliseconds, 180000);
    const tf1m = Timeframe.from('1m');
    const d = new Date();
    assert.equal(tf1m.computeElapsedCount(d.getTime() - 120000), 2);
    assert.equal(tf1m.computeElapsedCount(d.getTime() - 120000, d.getTime()), 2);
    await sleep(6100);
    d.setTime(Date.now());
    d.setMilliseconds(0);
    d.setSeconds(0);
    assert.equal(d.getTime(), tf1m.computeCongruentStartKey());
    assert.equal(d.getTime(), tf1m.computeCongruentStartKey(Date.now()));
 * ```
 */
class Timeframe {
  static #memoizCache = Object.create(null);
  #asLiteral;
  #asMilliseconds;
  /** Use `Timeframe.from()` instead for singleton instances/from memeocache. */
  constructor(tf) {
    if (tf instanceof Timeframe) {
      return tf;
    } else {
      if (typeof tf === 'string') {
        this.#asLiteral = tf;
        this.#asMilliseconds = millisecondsFromTimeframe(tf);
        this.computeElapsedCount = computeElapsedCount.bind(null, this.asMilliseconds);
        this.computeCongruentStartKey = computeCongruentStartKey.bind(
          null,
          this.asMilliseconds,
        );
      } else {
        throw new TypeError(
          'Creating timeframe from anything other than literal or instance is not supported yet!',
        );
      }
    }
  }
  [util.inspect.custom](depth, options) {
    return `Timeframe! ${this} has interval duration of ${+this} ms.`;
  }
  toJSON() {
    return JSON.stringify({ [this.asLiteral]: this.asMilliseconds });
  }
  get millisecondsLeftUntilNext() {
    return getTimeLeftUntilNextStart(this.#asMilliseconds);
  }
  /** '1m' */
  get asLiteral() {
    return this.#asLiteral;
  }
  /** 60000 */
  get asMilliseconds() {
    return this.#asMilliseconds;
  }
  static from(timeframe) {
    if (typeof timeframe === 'string') {
      if (!Timeframe.#memoizCache[timeframe]) {
        timeframe = new Timeframe(timeframe);
        Timeframe.#memoizCache[timeframe.asLiteral] = timeframe;
      } else {
        timeframe = Timeframe.#memoizCache[timeframe];
      }
    } else if (timeframe instanceof Timeframe) {
      if (!Timeframe.#memoizCache[timeframe.asLiteral]) {
        Timeframe.#memoizCache[timeframe.asLiteral] = timeframe;
      }
    } else {
      // Does not handle interval duration as constructor from argument yet.
      throw new TypeError(
        'Timeframe period duration not yet implemented as clonable source resource.',
      );
    }
    return timeframe;
  }
  static deallocCache() {
    for (const tf of Object.keys(Timeframe.#memoizCache))
      Timeframe.#memoizCache[tf] = null;
    Timeframe.#memoizCache = Object.create(null);
  }
  /** Converts a timeframe to text or number depending on context. TODO not yet satisified with results. */
  [Symbol.toPrimitive](hint) {
    if (hint === 'string') {
      return this.asLiteral;
    } else if (hint === 'number') {
      return this.asMilliseconds;
    } else {
      return `${this.asMilliseconds}milliseconds`;
    }
  }
}

function computeCongruentStartKey(interval, epoch = Date.now()) {
  return ~~(epoch / interval) * interval;
}

function computeElapsedCount(interval, startTimestamp, endTimestamp = Date.now()) {
  return ~~((endTimestamp - startTimestamp) / interval);
}

function getTimeLeftUntilNextStart(interval) {
  const now = Date.now();
  const startKey = ~~(now / interval) * interval;
  const next = startKey + interval;
  return next - now;
}

const LOOKUP_TF_TO_MILLISECONDS = Object.fromEntries(
  Object.entries({
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
    D: 86400,
    w: 604800,
    W: 604800,
    M: 2592000,
    y: 31536000,
    Y: 31536000,
  }).map(([timeUnitInitial, secondsPer]) => [timeUnitInitial, secondsPer * 1000]),
);

// 'Inspired' by https://github.com/BlackPhoenixSlo/TradingBot_NodeJS_Public/blob/main/utils/main-bot--time.js
function millisecondsFromTimeframe(timeframe) {
  // Note duplicates of upper and lowercase days, weeks and years but not months (since lower case is always minutes):
  const match = timeframe.trim().match(/^(\d+)([smhdDwWMyY])$/);
  if (!match)
    throw new Error('Timeframe format not viable!', {
      details: `Input⟦ ${timeframe || '∅'} ⟧ cannot be used to create valid Date object.`,
    });
  const [, quantity, unit] = match;
  return parseInt(quantity, 10) * LOOKUP_TF_TO_MILLISECONDS[unit];
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// prettier-ignore
['1m','3m','5m','15m','30m','45m','1h','2h','3h','4h','8h','12h','16h','20h','24h','2d','2D',].forEach((tfLiteral) => Timeframe.from(tfLiteral));

const tf1m = Timeframe.from('1m');
const tf2m = Timeframe.from('2m');
const tf3m = Timeframe.from('3m');
const tf5m = Timeframe.from('5m');
const tf15m = Timeframe.from('15m');
const tf1h = Timeframe.from('1h');
const tf1D = Timeframe.from('1D');

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Batches given range into as many contigious subsets as needed determined by given `batchSize`.
 * Useful if needing to warmup a paginating fetcher due API rate limits, etc.
 * @param {number} timeframeDurationMs - number of milliseconds the timeframe's period duration
 * @param {number} startTime - epoch unix timestamp < endTime
 * @param {number} endTime - epoch unix timestamp > startTime
 * @param {number} batchSize - number of elements to be in each subset, possibly excluding the last which could be fewer than this value
 * @returns
 */
function batchSequenceTimestampInterims(
  timeframeDurationMs,
  startTime,
  endTime,
  batchSize = 1441,
) {
  const totalIntervals = ~~((endTime - startTime) / timeframeDurationMs);
  const batches = [];
  // Seems like a job for Array.from({ length }).map...
  for (
    let i = 0, numBatches = Math.ceil(totalIntervals / batchSize);
    i < numBatches;
    i++
  ) {
    const batchStartTime = startTime + i * batchSize * timeframeDurationMs;
    batches.push({
      startTime: batchStartTime,
      endTime:
        i === numBatches - 1
          ? endTime
          : batchStartTime + batchSize * timeframeDurationMs - timeframeDurationMs,
    });
  }
  return batches;
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function getEarlierUTCMidnightDate(ofEpochDay = new Date()) {
  const now = ofEpochDay instanceof Date ? ofEpochDay : new Date(ofEpochDay);
  if (isNaN(now.getTime())) throw new TypeError('G');
  now.setUTCMilliseconds(0);
  now.setUTCSeconds(0);
  now.setUTCMinutes(0);
  now.setUTCHours(0);
  return now;
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
      return {
        year,
        month,
        day: i,
        epoch: now.getTime(),
      };
    });
}

export default Timeframe;
export {
  computeCongruentStartKey,
  computeElapsedCount,
  tf1m,
  tf2m,
  tf3m,
  tf5m,
  tf15m,
  tf1h,
  tf1D,
  batchSequenceTimestampInterims,
  getEarlierUTCMidnightDate,
  getPrecedingDaysofMonth,
};

/**
 * Helper function for (debug) displaying epoch, local and iso forms of a given datepochish value.
 * Demo:
 * ```js
 *   console.log(...datepochToLegibleArr(undefined, true)); //> 1724553312842 8/24/2024 @ 10:35:12 PM ≍ 2024-08-25 @ 02:35:12.842Z
 *   // or
 *   newData.forEach(({ timestamp, value }, i) => console.log('i@', i, '🗠:', value, '🕰:', ...datepochToLegibleArr(timestamp)));
 * ```
 * @param {?number|Date|string} datepochish - any value that can be used to instance a `Date`, defaults to current `new Date()`
 * @throws {TypeError} if given `datepochish` results in a created Date whose `getTime` is `NaN`
 * @param {boolean} includeISO - whether the equivalent ISO string is also appended
 * @returns {[number, string, string|undefined]} an array of the unix epoch timestamp, locale string and, (if opted for), iso string with its T swapped for @
 */
export const datepochToLegibleArr = function (
  datepochish = new Date(),
  includeISO = false,
) {
  const date = datepochish instanceof Date ? datepochish : new Date(datepochish);
  if (isNaN(date.getTime())) {
    throw new TypeError(`Input⟦ ${datepochish} ⟧is not valid type to date!`);
  }
  const arr = [date.getTime(), date?.toLocaleString().replace(', ', ' @ ')];
  return includeISO ? [...arr, '≍', date?.toISOString().replace('T', ' @ ')] : arr;
};
