import * as R from "ramda";
import { routes } from "../notabug-peer/json-schema";
import { curate } from "./utils";
import {
  sortThings,
  multiAuthor,
  multiTopic,
  multiDomain,
  multiSubmission,
  multiListing,
  repliesToAuthor
} from "../queries";

export const itemSources = {
  listing: (scope, parsed) => {
    const listings = R.path(["filters", "allow", "listings"], parsed) || [];
    if (!listings.length) return itemSources.topic();
    return multiListing(scope, {
      listings,
      indexer: parsed.indexer,
      sort: parsed.sort || "new"
    });
  },
  replies: (scope, parsed) => {
    const id = R.path(["filters", "allow", "repliesTo"], parsed);
    const type = R.path(["filters", "allow", "type"], parsed);
    if (!id) return itemSources.topic();
    return repliesToAuthor(scope, { type, repliesToAuthorId: `~${id}` });
  },
  op: (scope, parsed) => {
    const submissionIds = R.path(["filters", "allow", "ops"], parsed);
    if (!submissionIds.length) return itemSources.topic();
    return multiSubmission(scope, { submissionIds });
  },
  curator: (scope, parsed) => {
    const curators = R.prop("curators", parsed) || [];
    if (!curators.length) return itemSources.topic();
    return curate(scope, curators.map(id => `~${id}`), true).then(ids =>
      ids.map(thingId => routes.Thing.reverse({ thingId }))
    );
  },
  author: (scope, parsed) => {
    const authors = R.path(["filters", "allow", "authors"], parsed);
    const type = R.path(["filters", "allow", "type"], parsed);
    const authorIds = authors.map(id => `~${id}`);
    if (!authorIds.length) return itemSources.topic();
    return multiAuthor(scope, { type, authorIds });
  },
  domain: (scope, parsed, useListing = true) => {
    const domains = R.path(["filters", "allow", "domains"], parsed) || [];
    if (!domains.length) return itemSources.topic();
    if (useListing) {
      return multiListing(scope, {
        listings: domains.map(domain => `/domain/${domain}`),
        indexer: parsed.indexer,
        sort: parsed.sort || "new"
      });
    }
    return multiDomain(scope, { domains });
  },
  topic: (scope, parsed, useListing = true) => {
    const topics = R.path(["filters", "allow", "topics"], parsed) || [];
    if (!topics.length) topics.push("all");
    if (useListing) {
      return multiListing(scope, {
        listings: topics.map(topic => `/t/${topic}`),
        indexer: parsed.indexer,
        sort: parsed.sort || "new"
      });
    }
    return multiTopic(scope, { topics, sort: parsed.sort || "new" });
  }
};

export const fetchData = (scope, parsed, useListing = true) =>
  itemSources[parsed.itemSource](scope, parsed, useListing).then(thingSouls =>
    sortThings(scope, {
      thingSouls,
      sort: parsed.sort,
      tabulator: `~${parsed.tabulator}`,
      scores: !![
        "sort hot",
        "sort top",
        "sort best",
        "sort controversial",
        "ups",
        "downs",
        "score"
      ].find(parsed.isPresent),
      data: !![
        parsed.itemSource !== "topic" ? "topic" : null,
        parsed.itemSource !== "domain" ? "domain" : null,
        parsed.itemSource !== "author" ? "author" : null,
        "unique by content",
        "kind",
        "type",
        "require signed",
        "require anon",
        "alias",
        "ban domain",
        "ban topic",
        "ban author",
        "ban alias"
      ].find(parsed.isPresent)
    })
  );
