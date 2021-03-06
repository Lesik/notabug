import { query, all } from "gun-scope";
import { oracle } from "gun-cleric";
import { basic } from "gun-cleric-scope";
import { routes } from "../notabug-peer/json-schema";
import { PREFIX } from "../notabug-peer";

export default oracle({
  name: "tabulator",
  routes: [
    basic({
      path: `${PREFIX}/things/:thingId/votecounts@~:tab1.:tab2.`,
      priority: 10,
      throttleGet: 1000*60*60*4,
      checkMatch: ({ thingId }) => !!thingId,
      query: query((scope, route) => {
        const thingSoul = routes.Thing.reverse(route.match);
        return all([
          scope.get(`${thingSoul}/votesup`).count(),
          scope.get(`${thingSoul}/votesdown`).count(),
          scope.get(`${thingSoul}/allcomments`).count()
        ]).then(([up, down, comment]) => ({ up, down, comment, score: up - down }));
      })
    })
  ]
});
