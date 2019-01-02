import path from "path";
import express from "express";
import expressStaticGzip from "express-static-gzip";
import expires from "express-cache-headers";
import init from "./notabug-peer";

const staticMedia = express.Router();
staticMedia.use(
  "/media", expires({ ttl: 60*60*24 }),
  expressStaticGzip(path.join(__dirname, "..", "htdocs", "media"), { index: false })
);
staticMedia.use(
  "/static", expires({ ttl: 60*60*24 }),
  expressStaticGzip(path.join(__dirname, "..", "htdocs", "static"), { index: false })
);
staticMedia.use(express.static(path.join(__dirname, "..", "htdocs"), { index: false }));

export const initServer = ({ port, host, render, ...options }) => {
  const app = express();
  let nab;

  if (render) {
    app.use(staticMedia);
    require("@babel/register")({
      ignore: [ /(node_modules|server-build)/ ],
      presets: ["@babel/preset-env", "@babel/preset-react"]
    });
    const renderer = require("./renderer").default;
    app.get("*", expires(60), (...args) => renderer(nab, ...args));
  }

  const web = app.listen(port, host);

  nab = init({
    ...options,
    web: options.pistol ? undefined : web,
    peers: [
      ...(options.peers || []),
      ...(options.pistol ? [`http://${host}:${port}/gun`] : [])
    ]
  });
  if (options.pistol) require("../pistol/server")({ redis: options.redis, web });
  return nab;
};
