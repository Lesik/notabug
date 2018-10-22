import { prop, propOr } from "ramda";
import * as SOULS from "../notabug-peer/souls";
import { query, all } from "../notabug-peer/scope";
import { PREFIX, SOUL_DELIMETER } from "../notabug-peer/util";
import { sorts, multiTopic, singleAuthor, repliesToAuthor, sortThings } from "../queries";
import { oracle, basicQueryRoute } from "./oracle";

const LISTING_SIZE = 1000;

const FRONTPAGE_TOPICS = [
  "art",
  "ask",
  "books",
  "food",
  "funny",
  "gaming",
  "gifs",
  "movies",
  "music",
  "news",
  "notabug",
  "pics",
  "politics",
  "programming",
  "religion",
  "quotes",
  "science",
  "space",
  "technology",
  "travel",
  "tv",
  "videos",
  "whatever"
];

export default oracle({
  name: "indexer",
  concurrent: 1,
  routes: [
    basicQueryRoute({
      path: `${PREFIX}/t/:topic/firehose@~:id1.:id2.`,
      priority: 75,
      checkMatch: ({ topic }) => topic && (topic.toLowerCase() === topic) && topic.indexOf(":") === -1,
      query: query((scope, { match: { topic, id1, id2 } }) => {
        const normalTopics = topic === "front" ? FRONTPAGE_TOPICS : topic.split("+");
        const submitTopic = (topic === "front" || topic === "all") ? "whatever" : normalTopics[0] || "whatever";
        const topics = normalTopics.reduce((res, topic) =>
          [ ...res, topic, `chat:${topic}`, `comments:${topic}`], []);
        return multiTopic(scope, { topics })
          .then(thingSouls =>
            sortThings(scope, { sort: "new", thingSouls, tabulator: `~${id1}.${id2}` }))
          .then(things => serializeListing({ name: topic, things: things.slice(0, LISTING_SIZE) }))
          .then(serialized => ({
            ...serialized,
            includeRanks: false,
            submitTopic,
            isChat: true,
            tabs: ["hot", "new", "discussed", "controversial", "top", "firehose"]
              .map(tab => `${PREFIX}/t/${topic}/${tab}@~${id1}.${id2}.`)
              .join(SOUL_DELIMETER)
          }));
      })
    }),

    basicQueryRoute({
      path: `${PREFIX}/t/:topic/chat@~:id1.:id2.`,
      priority: 80,
      checkMatch: ({ topic }) => topic && (topic.toLowerCase() === topic) && topic.indexOf(":") === -1,
      query: query((scope, { match: { topic, id1, id2 } }) => {
        const normalTopics = topic === "front" ? FRONTPAGE_TOPICS : topic.split("+");
        const submitTopic = (topic === "front" || topic === "all") ? "whatever" : normalTopics[0] || "whatever";
        const topics = normalTopics.reduce((res, topic) =>
          [ ...res, `chat:${topic}`], []);
        return multiTopic(scope, { topics })
          .then(thingSouls =>
            sortThings(scope, { sort: "new", thingSouls, tabulator: `~${id1}.${id2}` }))
          .then(things => serializeListing({ name: topic, things: things.slice(0, LISTING_SIZE) }))
          .then(serialized => ({
            ...serialized,
            includeRanks: false,
            submitTopic,
            isChat: true,
            tabs: ["hot", "new", "discussed", "controversial", "top", "firehose", "chat"]
              .map(tab => `${PREFIX}/t/${topic}/${tab}@~${id1}.${id2}.`)
              .join(SOUL_DELIMETER)
          }));
      })
    }),

    basicQueryRoute({
      path: `${PREFIX}/t/front/:sort@~:id1.:id2.`,
      priority: 25,
      checkMatch: ({ sort }) => (sort in sorts),
      query: query((scope, { match: { sort, id1, id2 } }) =>
        multiTopic(scope, { topics: FRONTPAGE_TOPICS })
          .then(thingSouls =>
            sortThings(scope, { sort, thingSouls, tabulator: `~${id1}.${id2}` }))
          .then(things => serializeListing({ name: "front", things: things.slice(0, LISTING_SIZE) }))
          .then(serialized => ({
            ...serialized,
            includeRanks: true,
            submitTopic: "whatever",
            tabs: ["hot", "new", "discussed", "controversial", "top", "firehose"]
              .map(tab => `${PREFIX}/t/front/${tab}@~${id1}.${id2}.`)
              .join(SOUL_DELIMETER)
          })))
    }),

    basicQueryRoute({
      path: `${PREFIX}/things/:thingid/comments/:sort@~:id1.:id2.`,
      checkMatch: ({ sort }) => (sort in sorts),
      priority: 85,
      query: query((scope, { match: { thingid, id1, id2, sort } }) =>
        scope.get(SOULS.thingAllComments.soul({ thingid })).souls()
          .then(souls => [SOULS.thing.soul({ thingid }), ...souls])
          .then(thingSouls =>
            sortThings(scope, { sort, thingSouls, tabulator: `~${id1}.${id2}` }))
          .then(things => serializeListing({ things }))
          .then(serialized => scope.get(SOULS.thingData.soul({ thingid }))
            .then(data => ({
              ...serialized,
              name: propOr("", "topic", data),
              opId: thingid,
              submitTopic: propOr("whatever", "topic", data),
              includeRanks: false,
              tabs: [`${PREFIX}/things/${thingid}/comments/${sort}@~${id1}.${id2}.`]
            }))))
    }),

    basicQueryRoute({
      path: `${PREFIX}/domain/:domain/:sort@~:id1.:id2.`,
      priority: 25,
      checkMatch: ({ sort, domain }) =>
        (sort in sorts) && domain && (domain.toLowerCase() === domain),
      query: query((scope, { match: { domain, id1, id2, sort } }) =>
        scope.get(SOULS.domain.soul({ domain })).souls()
          .then(thingSouls =>
            sortThings(scope, { sort, thingSouls, tabulator: `~${id1}.${id2}` }))
          .then(things => serializeListing({ name: domain, things: things.slice(0, LISTING_SIZE) }))
          .then(serialized => ({
            ...serialized,
            includeRanks: true,
            submitTopic: "whatever",
            tabs: ["hot", "new", "discussed", "controversial", "top"]
              .map(tab => `${PREFIX}/domain/${domain}/${tab}@~${id1}.${id2}.`)
              .join(SOUL_DELIMETER)
          })))
    }),

    basicQueryRoute({
      path: `${PREFIX}/t/:topic/:sort@~:id1.:id2.`,
      priority: 60,
      checkMatch: ({ sort, topic }) => (sort in sorts) && topic && (topic.toLowerCase() === topic),
      query: query((scope, { match: { topic, sort, id1, id2 } }) => {
        const isAbnormal = topic.indexOf(":") !== -1;
        const topics = topic.split("+");
        const normalTopics = topics.filter(t => t && t.indexOf(":") === -1);
        const submitTopic = normalTopics[0] || "whatever";
        return multiTopic(scope, { topics })
          .then(thingSouls =>
            sortThings(scope, { sort, thingSouls, tabulator: `~${id1}.${id2}` }))
          .then(things => serializeListing({ name: topic, things: things.slice(0, LISTING_SIZE) }))
          .then(serialized => ({
            ...serialized,
            includeRanks: true,
            submitTopic,
            tabs: ["hot", "new", "discussed", "controversial", "top", ...(isAbnormal ? [] : ["firehose"])]
              .map(tab => `${PREFIX}/t/${topic}/${tab}@~${id1}.${id2}.`)
              .join(SOUL_DELIMETER)
          }));
      })
    }),

    basicQueryRoute({
      path: `${PREFIX}/user/:authorId/replies/:type/:sort@~:id1.:id2.`,
      priority: 20,
      checkMatch: ({ sort, type, authorId }) =>
        (sort in sorts) && authorId && type  && type.toLowerCase() == type &&
        (type === "overview" || type === "submitted" || type === "comments"),
      query: query((scope, { match: { authorId, type, sort, id1, id2 } }) =>
        repliesToAuthor(
          scope,
          { repliesToAuthorId: authorId ? `~${authorId}` : null, type }
        )
          .then(thingSouls => sortThings(scope, { sort, thingSouls, tabulator: `~${id1}.${id2}` }))
          .then(things => serializeListing({ things: things.slice(0, LISTING_SIZE) }))
          .then(serialized => ({
            ...serialized,
            name: "message"
          })))
    }),

    basicQueryRoute({
      path: `${PREFIX}/user/:authorId/:type/:sort@~:id1.:id2.`,
      priority: 30,
      checkMatch: ({ sort, type, authorId }) =>
        (sort in sorts) && authorId && type  && type.toLowerCase() == type &&
        (type === "overview" || type === "submitted" || type === "comments"),
      query: query((scope, { match: { authorId, type, sort, id1, id2 } }) =>
        all([
          singleAuthor(
            scope,
            { authorId: authorId ? `~${authorId}` : null, type }
          )
            .then(thingSouls => sortThings(scope, { sort, thingSouls, tabulator: `~${id1}.${id2}` }))
            .then(things => serializeListing({ things: things.slice(0, LISTING_SIZE) })),
          scope.get(`~${authorId}`).then()
        ]).then(([serialized, meta]) => ({
          ...serialized,
          name: propOr("", "alias", meta),
          userId: authorId,
          tabs: ["overview", "comments", "submitted"]
            .map(tab => `${PREFIX}/user/${authorId}/${tab}/${sort}@~${id1}.${id2}.`)
            .join(SOUL_DELIMETER)
        })))
    })
  ]
});

const serializeListing = ({ name="", things }) => ({
  name,
  ids: things.map(prop("id")).filter(id => !!id).join("+")
});
