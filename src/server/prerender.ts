export function prerender(root: HTMLElement): string {
  const document = root.ownerDocument;
  const copy = root.cloneNode(true) as HTMLElement;
  const originals = root.querySelectorAll("input,textarea,select,canvas");
  copy.querySelectorAll("input,textarea,select,canvas").forEach(
    (node, index) => {
      const source = originals[index];
      if (source.tagName === "CANVAS") {
        const image = document.createElement("img");
        for (const { name, value } of source.attributes) {
          image.setAttribute(name, value);
        }
        const computed = document.defaultView!.getComputedStyle(source);
        image.src = (source as HTMLCanvasElement).toDataURL();
        image.style.width = computed.width ||
          `${(source as HTMLCanvasElement).width}px`;
        image.style.height = computed.height ||
          `${(source as HTMLCanvasElement).height}px`;
        image.style.display = computed.display;
        image.style.margin = computed.margin;
        image.style.maxWidth = "100%";
        image.alt = source.getAttribute("aria-label") ?? "Chart preview";
        node.replaceWith(image);
      } else if (source.tagName === "INPUT") {
        node.setAttribute("value", (source as HTMLInputElement).value);
        node.toggleAttribute("checked", (source as HTMLInputElement).checked);
      } else if (source.tagName === "TEXTAREA") {
        node.textContent = (source as HTMLTextAreaElement).value;
      } else if (source.tagName === "SELECT") {
        [...(node as HTMLSelectElement).options].forEach((option, i) =>
          option.toggleAttribute(
            "selected",
            (source as HTMLSelectElement).options[i].selected,
          )
        );
      }
    },
  );
  copy.querySelectorAll("script").forEach((node) => node.remove());
  copy.querySelectorAll("[tabindex]").forEach((node) =>
    node.removeAttribute("tabindex")
  );
  copy.querySelectorAll("input,select,textarea,button").forEach((node) =>
    node.setAttribute("disabled", "")
  );
  // Prefix IDs and references so the preview can coexist with a connected staging tree.
  const ids = [copy, ...copy.querySelectorAll<HTMLElement>("[id]")].map(
    (node) => node.id,
  ).filter(Boolean);
  const replacements = new Map(
    ids.map(
      (id) => [id, id === "app" ? "mosaic-static-preview" : `preview-${id}`],
    ),
  );
  const pattern = new RegExp(
    `#(${
      ids.map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).sort((
        a,
        b,
      ) => b.length - a.length).join("|")
    })(?![\\w-])`,
    "g",
  );
  for (const node of [copy, ...copy.querySelectorAll<HTMLElement>("*")]) {
    for (const attribute of [...node.attributes]) {
      if (attribute.name.startsWith("on")) {
        node.removeAttribute(attribute.name);
      } else if (attribute.name === "id") {
        node.id = replacements.get(attribute.value)!;
      } else if (
        ["for", "aria-labelledby", "aria-describedby", "aria-controls"]
          .includes(attribute.name)
      ) {
        node.setAttribute(
          attribute.name,
          attribute.value.split(" ").map((id) => replacements.get(id) ?? id)
            .join(" "),
        );
      } else {node.setAttribute(
          attribute.name,
          attribute.value.replaceAll(document.URL + "#", "#").replace(
            pattern,
            (_, id) => `#${replacements.get(id)}`,
          ),
        );}
    }
    if (node.tagName === "STYLE") {
      node.textContent = node.textContent!.replace(
        pattern,
        (_, id) => `#${replacements.get(id)}`,
      );
    }
  }
  copy.setAttribute("aria-label", "Initial view");
  return copy.outerHTML;
}
