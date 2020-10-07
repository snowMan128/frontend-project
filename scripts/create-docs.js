const jsdoc2md = require("jsdoc-to-markdown");
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");

const groups = [
  { dir: "object", title: "Objects", order: 301 },
  { dir: "control", title: "Controls", order: 401 },
  { dir: "visual", title: "Visual & Experience", order: 501 },
];

const currentTagsUrl = "https://api.github.com/repos/heartexlabs/label-studio/contents/docs/source/tags";

// header with tag info and autogenerated order
// don't touch whitespaces
const infoHeader = (name, group, isNew = false) => `---
title: ${name}
type: tags
order: ${groups.find(g => g.dir === group).order++}
${isNew ? "is_new: t\n" : ""}---

`;

const outputDir = path.resolve(__dirname + "/../docs");

fs.mkdirSync(outputDir, { recursive: true });

// get list of already exsting tags if possible to set `is_new` flag
fetch(currentTagsUrl)
  .then(res => (res.ok ? res.json() : null))
  .then(list => list && list.map(file => file.name.replace(/.md$/, "")))
  .catch(() => null)
  .then(tags => {
    for (let { dir, title } of groups) {
      console.log("## " + title);
      const inputFile = path.resolve(__dirname + "/../src/tags/" + dir + "/*.js");
      const templateData = jsdoc2md.getTemplateDataSync({ files: inputFile });

      templateData
        // all tags are with this kind and leading capital letter
        .filter(t => t.kind === "member" && t.name.match(/^[A-Z]/))
        .forEach(t => {
          const name = t.name.toLowerCase();
          // there are no new tags if we didn't get the list
          const isNew = tags ? !tags.includes(name) : false;
          const str = jsdoc2md
            .renderSync({ data: [t], "example-lang": "html" })
            // add header with info instead of header for github
            .replace(/^(.*?\n){3}/, infoHeader(t.name, dir, isNew))
            // remove useless Kind: member
            .replace(/\*\*Kind\*\*.*?\n/, "### Parameters\n")
            .replace(/\*\*Example\*\*\s*\n/g, "### Example\n")
            // move comments from examples to description
            .replace(/```html[\n\s]*<!-- (.*?) -->[\n\s]*/g, "\n$1\n\n```html\n")
            // change example language if it looks like JSON
            .replace(/```html[\n\s]*([[{])/g, "```json\n$1");
          fs.writeFileSync(path.resolve(outputDir, `${name}.md`), str);
        });
    }
  });
