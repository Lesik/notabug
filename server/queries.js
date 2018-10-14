import {
  compose, map, reduce, prop, propOr, pathOr, sortBy, difference, path, isNil, filter
} from "ramda";
import {
  emptyPromise, unionArrays, intersectArrays, mergeObjects, getDayStr, PREFIX,
} from "./notabug-peer/util";
import { query, all, resolve } from "./notabug-peer/scope";
import * as SOULS from "./notabug-peer/souls";

export const getTopicSouls = params => {
  const { topics=["all"] } = (params || {});
  const days = propOr(365, "days", params) || 90;
  const dayStrings = [];
  const oneDay = (1000*60*60*24);
  const start = (new Date()).getTime() - oneDay * parseInt(days, 10);
  for (let i = 0; i <= (days + 1); i++) dayStrings.push(getDayStr(start + (i * oneDay)));
  return Object.keys(topics.reduce(
    (result, topicName) => dayStrings.reverse().reduce(
      (res, ds) => ({ ...res, [`${PREFIX}/topics/${topicName}/days/${ds}`]: true }), result
    ), {}
  ));
};

const thingVoteCount = voteType => query((scope, thingSoul) =>
  scope.get(`${thingSoul}/${voteType}`).count());

export const thingVotesUp = thingVoteCount("votesup");
export const thingVotesDown = thingVoteCount("votesdown");
export const thingAllCommentsCount = query((scope, thingSoul) =>
  scope.get(`${thingSoul}/allcomments`).count());

export const thing = query((scope, thingSoul) => scope.get(thingSoul).then(meta => {
  if (!meta || !meta.id) return null;
  const result = { id: meta.id, timestamp: meta.timestamp };
  const replyToSoul = path(["replyTo", "#"], meta);
  const opSoul = path(["op", "#"], meta);
  const opId = opSoul ? SOULS.thing.isMatch(opSoul).thingid : null;
  const replyToId = replyToSoul ? SOULS.thing.isMatch(replyToSoul).thingid : null;
  if (opId) result.opId = opId;
  if (replyToId) result.replyToId = replyToId;
  return result;
}));

export const thingScores = query((scope, thingSoul) => all([
  thingVotesUp(scope, thingSoul),
  thingVotesDown(scope, thingSoul),
  thingAllCommentsCount(scope, thingSoul),
]).then(([up, down, comment]) => ({ up, down, comment, score: up - down })));

export const thingMeta = query((scope, { thingSoul, tabulator }) => all([
  thing(scope, thingSoul),
  tabulator
    ? scope.get(`${thingSoul}/votecounts@${tabulator}.`).then() // eslint-disable-line
    : thingScores(scope, thingSoul).then(),
]).then(([meta, votes = {}]) => {
  if (!meta || !meta.id) return null;
  return { ...meta, votes };
}));

export const listingIds = query((scope, soul) =>
  scope.get(soul).then(compose(ids => (ids || "").split("+").filter(x => !!x), prop("ids"))), "listingIds"
);

export const multiThingMeta = query((scope, params) => all(propOr([], "thingSouls", params)
  .map(thingSoul => thingMeta(scope, { ...params, thingSoul }))));

export const multiThing = query((scope, params) => all(propOr([], "thingSouls", params)
  .map(thingSoul => thing(scope, thingSoul))));

export const singleThingData = query((scope, { thingId: thingid }) =>
  scope.get(SOULS.thingData.soul({ thingid })).then(data => {
    const { _, ...actual } = data || {}; // eslint-disable-line no-unused-vars
    return { [thingid]: data ? actual : data };
  }));

export const singleAuthor = query((scope, params) => all([
  (params.type && params.type !== "submitted" && params.type !== "overview")
    ? resolve([]) : scope.get(params.authorId).get("submissions").souls(),
  (params.type && params.type !== "comments" && params.type !== "overview")
    ? resolve([]) : scope.get(params.authorId).get("comments").souls()
]).then(([submissions, comments]) => unionArrays([submissions, comments])));

export const repliesToAuthor = query((scope, { repliesToAuthorId, ...params }) =>
  singleAuthor(scope, { ...params, authorId: repliesToAuthorId })
    .then(authoredSouls => all(authoredSouls.map(authoredSoul =>
      scope.get(`${authoredSoul}/comments`).souls())).then(unionArrays)));

export const singleDomain = query((scope, { domain }) =>
  scope.get(SOULS.domain.soul({ domain })).souls());

export const singleUrl = query((scope, { url }) => scope.get(SOULS.url.soul({ url })).souls());

export const singleTopic = query((scope, params) => all(map(
  soul => scope.get(soul).souls(),
  getTopicSouls({ ...params, topics: [params.topic] })
)).then(reduce((souls, more) => (souls.length < 1000) ? [...souls, ...more] : souls, [])));

export const singleSubmission = query((scope, params) =>
  scope.get(SOULS.thingAllComments.soul({ thingid: params.submissionId }))
    .souls(souls => [SOULS.thing.soul({ thingid: params.submissionId }), ...souls]));

export const lensQuery = query((scope, params) => all([
  params.lens.repliesToAuthorId
    ? repliesToAuthor(scope, { ...params.lens, ...params })
    : resolve(null),
  multiAuthor(scope, { ...params.lens, ...params }),
  multiDomain(scope, { ...params.lens, ...params }),
  multiUrl(scope, { ...params.lens, ...params }),
  multiTopic(scope, { ...params.lens, ...params }),
  multiSubmission(scope, { ...params.lens, ...params }),
  multiSpace(scope, { ...params.lens, ...params }),
]).then(intersectArrays));

export const storedLens = query((scope, lensSoul) => all([
  scope.get(lensSoul).get("things").souls(),
]).then(([thingSouls]) => thingSouls), "lens");

export const singleLens = query((scope, { lensSoul, ...params }) => all([
  lensSoul ? storedLens(lensSoul) : resolve(null),
]).then(([thingSouls]) => lensQuery(scope, params)
  .then(lensSouls => (lensSouls && lensSouls.length)
    ? intersectArrays([lensSouls, thingSouls])
    : (thingSouls || []))
));

export const spaceQuery = query((scope, params) => !params.space ? emptyPromise : all([
  multiLens(scope, { ...params, lenses: params.space.good }),
  multiLens(scope, { ...params, lenses: params.space.bad }),
]).then(([goodSouls, badSouls]) => difference(goodSouls || [], badSouls || [])));

export const storedSpace = query((scope, spaceSoul) => all([
  scope.get(spaceSoul).get("good").souls(),
  scope.get(spaceSoul).get("bad").souls(),
]).then(([goodLensSouls, badLensSouls]) => spaceQuery(scope, {
  space: {
    good: goodLensSouls.map(lensSoul => ({ lensSoul })),
    bad: badLensSouls.map(lensSoul => ({ lensSoul })),
  },
})));

export const singleSpace = query((scope, { spaceSoul, ...params }) => all([
  spaceSoul ? storedSpace(spaceSoul) : resolve(null),
]).then(([thingSouls]) => spaceQuery(scope, params)
  .then(querySouls => querySouls && querySouls.length
    ? intersectArrays([querySouls, thingSouls])
    : (thingSouls || [])
  )
));

const multiQuery = (singleQuery, plural, single, collate=unionArrays) =>
  query((scope, params) => isNil(prop(plural, params)) ? emptyPromise : all(map(
    val => singleQuery(scope, { ...params, [single]: val }), propOr([], plural, params)
  )).then(collate));

export const multiThingData = multiQuery(singleThingData, "thingIds", "thingId", mergeObjects);
export const multiAuthor = multiQuery(singleAuthor, "authorIds", "authorId");
export const multiDomain = multiQuery(singleDomain, "domains", "domain");
export const multiUrl = multiQuery(singleUrl, "urls", "url");
export const multiTopic = multiQuery(singleTopic, "topics", "topic");
export const multiSubmission = multiQuery(singleSubmission, "submissionIds", "submissionId");
export const multiLens = multiQuery(singleLens, "lenses", "lens");
export const multiSpace = multiQuery(singleSpace, "spaces", "space");

const voteSort = fn => (scope,  params) => multiThingMeta(scope, params)
  .then(compose(sortBy(fn), filter(x => !!x)));
const timeSort = fn => (scope,  params) => multiThing(scope, params)
  .then(compose(sortBy(fn), filter(x => !!x)));

export const sorts = {
  new: timeSort(compose(x => -1 * x, prop("timestamp"))),
  old: timeSort(prop("timestamp")),
  active: voteSort(({ timestamp, lastActive }) => (-1 * (lastActive || timestamp))),
  top: voteSort(compose(x => -1 * parseInt(x, 10), pathOr(0, ["votes", "score"]))),
  comments: voteSort(compose(x => -1 * x, pathOr(0, ["votes", "comment"]))),
  discussed: voteSort(thing => {
    const timestamp = prop("timestamp", thing);
    const score = parseInt(pathOr(0, ["votes", "comment"], thing), 10);
    const seconds = (timestamp/1000) - 1134028003;
    const order = Math.log10(Math.max(Math.abs(score), 1));
    if (!score) return 1000000000 - seconds;
    return -1 * (order + seconds / 45000);
  }),
  hot: voteSort(thing => {
    const timestamp = prop("timestamp", thing);
    const score = parseInt(pathOr(0, ["votes", "score"], thing), 10);
    const seconds = (timestamp/1000) - 1134028003;
    const order = Math.log10(Math.max(Math.abs(score), 1));
    let sign = 0;
    if (score > 0) { sign = 1; } else if (score < 0) { sign = -1; }
    return -1 * (sign * order + seconds / 45000);
  }),
  best: voteSort(thing => {
    const ups = parseInt(pathOr(0, ["votes", "up"], thing), 10);
    const downs = parseInt(pathOr(0, ["votes", "down"], thing), 10);
    const n = ups + downs;
    if (n === 0) return 0;
    const z = 1.281551565545; // 80% confidence
    const p = ups / n;
    const left = p + 1/(2*n)*z*z;
    const right = z*Math.sqrt(p*(1-p)/n + z*z/(4*n*n));
    const under = 1+1/n*z*z;
    return -1 * ((left - right) / under);
  }),
  controversial: voteSort(thing => {
    const ups = parseInt(pathOr(0, ["votes", "up"], thing), 10);
    const downs = parseInt(pathOr(0, ["votes", "down"], thing), 10);
    if (ups <= 0 || downs <= 0) return 0;
    const magnitude = ups + downs;
    const balance = (ups > downs) ? downs / ups : ups /downs;
    return -1 * (magnitude ** balance);
  }),
};

export const sortThings = (scope, params) => (sorts[params.sort] || sorts.new)(scope, params);