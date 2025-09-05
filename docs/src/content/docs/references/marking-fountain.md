---
title: 🖋️ Marking Files for Fountain
sidebar:
  order: 1
---

There are currently three ways to convert a regular Obsidian note into a hybrid Markdown+Fountain note.

## 🎨 (A) Frontmatter Properties: cssclasses

```md
---
cssclasses:
  - fountain
---

EXT. SOME PLACE - DAY

This is some scene description.

HERO
I'm here to save the day!
```

Pros:

- Technically this plugin just adds styling, so cssclasses may semantically make sense for you.
- You can use Search or Dataview to filter on the `[cssclasses:fountain]` Property.

Cons:

- I guess some people don't like frontmatter, you have to make sure you declare for each note.

## 🔖 (B) Frontmatter Properties: tags

```md
---
tags:
  - fountain
---

EXT. SOME PLACE - DAY

This is some scene description.

HERO
I'm here to save the day!
```

Pros

- You can use Search or Dataview to filter on the `[tags]` Property.
- You may like that you can click on Tags to auto-populate the Search pane

Cons:

- Again, I guess some people don't like frontmatter, you have to make sure you declare for each note.

## 📄 (C) File Extension

```md
<!-- This file is named `Introduction.fountain.md` -->
<!-- You can also name it `Introduction.fountain`, but you will need obsidian-custom-file-extensions-plugin -->

EXT. SOME PLACE - DAY

This is some scene description.

HERO
I'm here to save the day!
```

Pros:

- No additional frontmatter.
- If integrating with external tools outside of Obsidian, you can recognize this file as Fountain by its filename, instead of parsing the frontmatter.

Cons

- To some people, `.fountain.md` might look ugly. But this is intended and good as it's kept standard and treated as a `.md` file by apps like Obsidian.
- If you want to use `.fountain` file extension directly, you will need an Obsidian plugin like [MeepTech/obsidian-custom-file-extensions-plugin](https://github.com/MeepTech/obsidian-custom-file-extensions-plugin) to be able to open it like normal. It's super simple though!

---

Be aware that a note just only needs **at least one** of these attributes to be recognized for Fountain. If more than one attribute is applied, then it still works!
