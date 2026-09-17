(async () => {
  const app = await (await import(new URL("./app.js", location.href))).ready;
  const wait = async (test) => {
    const start = performance.now();
    while (!test()) {
      if (document.querySelector('[role="alert"]')) {
        throw new Error(document.querySelector('[role="alert"]').textContent);
      }
      if (performance.now() - start > 10000) {
        throw new Error("Flight results did not settle");
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  };
  const expected = await (await fetch("/__expected/flights")).json();
  const fields = ["delay", "time", "distance"];
  const select = (field, value) => {
    const input = document.getElementById(`filter-${field}`);
    input.value = String(value);
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };
  let verified = 0;
  for (const order of [[0, 1, 2], [2, 0, 1], [1, 2, 0]]) {
    for (const state of expected) {
      for (const index of order) select(fields[index], state.indices[index]);
      await app.settle();
      await wait(() =>
        ["count", "delay", "ontime"].every((field) => {
          const value = document.getElementById(field).dataset.value;
          return state[field] === null
            ? value === "null"
            : Math.abs(Number(value) - state[field]) < 1e-8;
        })
      );
      verified++;
    }
  }
  for (let i = 0; i < 120; i++) select(fields[i % 3], i % [4, 5, 4][i % 3]);
  document.getElementById("reset").click();
  await app.settle();
  await wait(() => document.getElementById("count").dataset.value === "231083");
  let freeBrush = false;
  if (app.engine.value === "wasm") {
    select("delay", 3);
    await app.settle();
    const svg = document.querySelector("#chart-delay svg");
    const overlay = svg.querySelector(".overlay");
    const bounds = svg.getBoundingClientRect();
    const ratio = bounds.width / Number(svg.getAttribute("width"));
    const y = overlay.getBoundingClientRect().top + 30;
    const x = (value) => bounds.left + svg.scale("x").apply(value) * ratio;
    overlay.dispatchEvent(
      new MouseEvent("mousedown", {
        clientX: x(13),
        clientY: y,
        bubbles: true,
        view: globalThis,
        buttons: 1,
      }),
    );
    globalThis.dispatchEvent(
      new MouseEvent("mousemove", {
        clientX: x(47),
        clientY: y,
        bubbles: true,
        view: globalThis,
        buttons: 1,
      }),
    );
    globalThis.dispatchEvent(
      new MouseEvent("mouseup", {
        clientX: x(47),
        clientY: y,
        bubbles: true,
        view: globalThis,
      }),
    );
    await app.settle();
    const range = JSON.parse(
      document.getElementById("chart-delay").dataset.range,
    );
    if (!range || document.getElementById("filter-delay").value !== "custom") {
      throw new Error("Free brush did not replace the preset");
    }
    const count =
      await (await fetch(`/__expected/range?low=${range[0]}&high=${range[1]}`))
        .json();
    await wait(() =>
      Number(document.getElementById("count").dataset.value) === count
    );
    freeBrush = true;
    document.getElementById("reset").click();
    await app.settle();
  }
  if (document.documentElement.scrollWidth > innerWidth) {
    throw new Error("Horizontal overflow");
  }
  return {
    verified,
    rapidEvents: 120,
    viewport: innerWidth,
    engine: document.documentElement.dataset.engine,
    freeBrush,
  };
})();
