(function () {
  let cleanups = [];
  let dragState = null;
  let pendingTouchDrag = null;
  let activeTouchTarget = null;
  const TOUCH_DRAG_DELAY = 220;
  const TOUCH_SCROLL_THRESHOLD = 10;

  function clearBindings() {
    cleanups.forEach((cleanup) => cleanup());
    cleanups = [];
  }

  function listen(node, eventName, handler) {
    node.addEventListener(eventName, handler);
    cleanups.push(() => node.removeEventListener(eventName, handler));
  }

  function canStartDrag(options) {
    return !options.canDrag || options.canDrag();
  }

  function setDragData(event, type, id) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
    event.dataTransfer.setData("application/x-section-dnd-type", type);
  }

  function clearDragClasses() {
    document.querySelectorAll(".dragging, .drag-over").forEach((node) => {
      node.classList.remove("dragging", "drag-over");
    });
  }

  function endDrag() {
    clearDragClasses();
    document.body.classList.remove("section-dnd-touching");
    dragState = null;
    activeTouchTarget = null;
  }

  function isInteractiveTarget(target) {
    return Boolean(target.closest("button, input, label, select, textarea, a"));
  }

  function cancelPendingTouchDrag() {
    if (pendingTouchDrag?.timer) {
      window.clearTimeout(pendingTouchDrag.timer);
    }
    pendingTouchDrag = null;
  }

  function startTouchHouseDrag() {
    if (!pendingTouchDrag) return;
    const { house, houseId, sectionId, pointerId } = pendingTouchDrag;
    dragState = { type: "house", id: houseId, sectionId, pointerId, viaPointer: true };
    house.classList.add("dragging");
    document.body.classList.add("section-dnd-touching");
    pendingTouchDrag = null;
  }

  function setActiveTouchTarget(target) {
    if (activeTouchTarget === target) return;
    if (activeTouchTarget) activeTouchTarget.classList.remove("drag-over");
    activeTouchTarget = target;
    if (activeTouchTarget) activeTouchTarget.classList.add("drag-over");
  }

  function getTouchDropTarget(event) {
    const target = document.elementFromPoint(event.clientX, event.clientY);
    if (!target) return null;

    const houseTarget = target.closest("[data-house-card]");
    if (houseTarget && houseTarget.dataset.houseCard !== dragState?.id) return houseTarget;

    return target.closest("[data-house-drop-section]");
  }

  function bindSectionDragDrop(options = {}) {
    clearBindings();

    document.querySelectorAll("[data-section-card]").forEach((section) => {
      listen(section, "dragstart", (event) => {
        if (!canStartDrag(options)) {
          event.preventDefault();
          return;
        }

        const sectionId = section.dataset.sectionCard;
        dragState = { type: "section", id: sectionId };
        section.classList.add("dragging");
        setDragData(event, "section", sectionId);
      });

      listen(section, "dragover", (event) => {
        if (!dragState || dragState.type !== "section") return;
        event.preventDefault();
        section.classList.add("drag-over");
        event.dataTransfer.dropEffect = "move";
      });

      listen(section, "dragleave", (event) => {
        if (!section.contains(event.relatedTarget)) {
          section.classList.remove("drag-over");
        }
      });

      listen(section, "drop", (event) => {
        if (!dragState || dragState.type !== "section") return;
        event.preventDefault();
        section.classList.remove("drag-over");
        if (dragState.id !== section.dataset.sectionCard) {
          options.onSectionDrop?.(dragState.id, section.dataset.sectionCard);
        }
        endDrag();
      });

      listen(section, "dragend", endDrag);
    });

    document.querySelectorAll("[data-house-card]").forEach((house) => {
      listen(house, "pointerdown", (event) => {
        if (event.pointerType === "mouse" || event.button !== 0 || isInteractiveTarget(event.target)) return;
        if (!canStartDrag(options)) return;

        cancelPendingTouchDrag();
        try {
          house.setPointerCapture(event.pointerId);
        } catch (error) {
          // Some browsers only allow capture for active pointers. Dragging still works without it.
        }
        pendingTouchDrag = {
          house,
          houseId: house.dataset.houseCard,
          sectionId: house.dataset.sectionId || "",
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          timer: window.setTimeout(startTouchHouseDrag, TOUCH_DRAG_DELAY),
        };
      });

      listen(house, "pointermove", (event) => {
        if (pendingTouchDrag?.pointerId === event.pointerId) {
          const distance = Math.hypot(event.clientX - pendingTouchDrag.startX, event.clientY - pendingTouchDrag.startY);
          if (distance > TOUCH_SCROLL_THRESHOLD) cancelPendingTouchDrag();
          return;
        }

        if (!dragState?.viaPointer || dragState.pointerId !== event.pointerId) return;
        event.preventDefault();
        setActiveTouchTarget(getTouchDropTarget(event));
      });

      listen(house, "pointerup", (event) => {
        if (pendingTouchDrag?.pointerId === event.pointerId) {
          cancelPendingTouchDrag();
          return;
        }

        if (!dragState?.viaPointer || dragState.pointerId !== event.pointerId) return;
        event.preventDefault();

        if (activeTouchTarget?.dataset.houseCard) {
          options.onHouseDrop?.(dragState.id, activeTouchTarget.dataset.sectionId || "", activeTouchTarget.dataset.houseCard);
        } else if (activeTouchTarget?.dataset.houseDropSection) {
          options.onHouseDrop?.(dragState.id, activeTouchTarget.dataset.houseDropSection, null);
        }
        endDrag();
      });

      listen(house, "pointercancel", (event) => {
        if (pendingTouchDrag?.pointerId === event.pointerId) cancelPendingTouchDrag();
        if (dragState?.viaPointer && dragState.pointerId === event.pointerId) endDrag();
      });

      listen(house, "dragstart", (event) => {
        if (!canStartDrag(options)) {
          event.preventDefault();
          return;
        }

        const houseId = house.dataset.houseCard;
        dragState = {
          type: "house",
          id: houseId,
          sectionId: house.dataset.sectionId || "",
        };
        house.classList.add("dragging");
        setDragData(event, "house", houseId);
      });

      listen(house, "dragover", (event) => {
        if (!dragState || dragState.type !== "house") return;
        event.preventDefault();
        house.classList.add("drag-over");
        event.dataTransfer.dropEffect = "move";
      });

      listen(house, "dragleave", (event) => {
        if (!house.contains(event.relatedTarget)) {
          house.classList.remove("drag-over");
        }
      });

      listen(house, "drop", (event) => {
        if (!dragState || dragState.type !== "house") return;
        event.preventDefault();
        event.stopPropagation();
        house.classList.remove("drag-over");

        const targetHouseId = house.dataset.houseCard;
        if (dragState.id !== targetHouseId) {
          options.onHouseDrop?.(dragState.id, house.dataset.sectionId || "", targetHouseId);
        }
        endDrag();
      });

      listen(house, "dragend", endDrag);
    });

    document.querySelectorAll("[data-house-drop-section]").forEach((dropZone) => {
      listen(dropZone, "dragover", (event) => {
        if (!dragState || dragState.type !== "house") return;
        event.preventDefault();
        dropZone.classList.add("drag-over");
        event.dataTransfer.dropEffect = "move";
      });

      listen(dropZone, "dragleave", (event) => {
        if (!dropZone.contains(event.relatedTarget)) {
          dropZone.classList.remove("drag-over");
        }
      });

      listen(dropZone, "drop", (event) => {
        if (!dragState || dragState.type !== "house") return;
        event.preventDefault();
        dropZone.classList.remove("drag-over");
        options.onHouseDrop?.(dragState.id, dropZone.dataset.houseDropSection, null);
        endDrag();
      });
    });
  }

  window.SectionDragDrop = {
    bindSectionDragDrop,
    clearBindings,
  };
})();
