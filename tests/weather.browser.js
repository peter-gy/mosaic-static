(async () => {
  const app = await (await import(new URL("./app.js", location.href))).ready;
  const expected = await (await fetch("/__expected/weather")).json();
  let verified = 0;
  for (const state of expected) {
    for (const name of ["season", "year"]) {
      const input = document.getElementById(name);
      input.value = String(state[name]);
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    document.querySelector(`[data-weather="${state.weather}"]`).click();
    await app.settle();
    const start = performance.now();
    while (
      document.getElementById("days").dataset.value !== String(state.days)
    ) {
      if (document.querySelector('[role="alert"]')) {
        throw new Error(document.querySelector('[role="alert"]').textContent);
      }
      if (performance.now() - start > 10000) {
        throw new Error(
          `Weather results did not settle: ${JSON.stringify(state)}`,
        );
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    verified++;
  }
  document.getElementById("reset").click();
  await app.settle();
  if (document.documentElement.scrollWidth > innerWidth) {
    throw new Error("Horizontal overflow");
  }
  return { verified, viewport: innerWidth };
})();
