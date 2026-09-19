export const GLOSSARY_TERMS: Record<string, { term: string; definition: string }> = {
  qubo: {
    term: "QUBO",
    definition: "A mathematical way of writing 'which combination of options is cheapest?'"
  },
  ising: {
    term: "Ising Model",
    definition: "The exact same optimization problem, translated into the physics language of a quantum computer."
  },
  qaoa: {
    term: "QAOA",
    definition: "A hybrid quantum-classical algorithm that searches through vast combinations to find low-cost answers."
  },
  qubit: {
    term: "Qubit",
    definition: "A quantum bit. In NADI, each qubit represents a specific binary signal decision (priority axis or bias strength)."
  },
  "approx-ratio": {
    term: "Approximation Ratio",
    definition: "How close the quantum solution came to the mathematically perfect global optimum (1.0 = exact match)."
  },
  "cost-function": {
    term: "Cost Function",
    definition: "The total penalty score combining waiting time, queues, fuel, and emissions that the solver tries to minimize."
  },
  spillback: {
    term: "Spillback",
    definition: "When a traffic queue grows so long that it physically blocks upstream intersections and paralyzes gridlock."
  },
  "green-corridor": {
    term: "Green Corridor",
    definition: "A synchronized wave of green lights clearing traffic ahead of an oncoming emergency ambulance."
  }
};

export class GlossaryPopover {
  private popoverEl: HTMLElement;

  constructor() {
    this.popoverEl = document.createElement("div");
    this.popoverEl.className = "glossary-popover";
    this.popoverEl.style.display = "none";
    document.body.appendChild(this.popoverEl);
    this.bindEvents();
  }

  private bindEvents() {
    document.addEventListener("mouseover", (e) => {
      const target = (e.target as HTMLElement).closest("[data-glossary]") as HTMLElement;
      if (target) {
        const key = target.getAttribute("data-glossary")?.toLowerCase() || "";
        const entry = GLOSSARY_TERMS[key];
        if (entry) {
          this.show(entry.term, entry.definition, target.getBoundingClientRect());
        }
      }
    });

    document.addEventListener("mouseout", (e) => {
      const target = (e.target as HTMLElement).closest("[data-glossary]");
      if (target) {
        this.hide();
      }
    });
  }

  public show(term: string, definition: string, rect: DOMRect) {
    this.popoverEl.innerHTML = `
      <div class="glossary-term">${term}</div>
      <div class="glossary-def">${definition}</div>
    `;
    this.popoverEl.style.display = "block";
    const popRect = this.popoverEl.getBoundingClientRect();

    let top = rect.bottom + 8;
    let left = rect.left + rect.width / 2 - popRect.width / 2;

    if (left < 10) left = 10;
    if (left + popRect.width > window.innerWidth - 10) {
      left = window.innerWidth - popRect.width - 10;
    }
    if (top + popRect.height > window.innerHeight - 10) {
      top = rect.top - popRect.height - 8;
    }

    this.popoverEl.style.top = `${top}px`;
    this.popoverEl.style.left = `${left}px`;
  }

  public hide() {
    this.popoverEl.style.display = "none";
  }
}
