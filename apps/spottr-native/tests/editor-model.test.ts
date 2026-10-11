import assert from "node:assert/strict";
import test from "node:test";
import {
  canAdvanceEditorStep,
  editorErrors,
  errorsForStep,
  errorDestination,
  updateLineupTime,
} from "../src/dashboard/editorModel";
import { emptyEvent, type EventDraft } from "../src/dashboard/data";

const now = Date.parse("2026-10-11T12:00:00Z");
const valid = (): EventDraft => ({
  ...emptyEvent(),
  title: "QA night",
  description: "A valid event description",
  vibe: "Chill",
  city: "Bucuresti",
  locationName: "QA Club",
  googlePlaceId: "ChIJ-qa",
  latitude: 44,
  longitude: 26,
  startTime: "2026-10-15T20:00",
  endTime: "2026-10-16T06:00",
  vatPercentage: 0,
});

test("Next remains disabled for incomplete current fields and enables only when this step is ready", () => {
  assert.equal(canAdvanceEditorStep(emptyEvent(), false, 0, now), false);
  assert.equal(
    canAdvanceEditorStep({ ...valid(), title: "xy" }, false, 0, now),
    false,
  );
  assert.equal(
    canAdvanceEditorStep({ ...valid(), description: "short" }, false, 0, now),
    false,
  );
  assert.equal(
    canAdvanceEditorStep({ ...valid(), vibe: "" }, false, 0, now),
    false,
  );
  assert.equal(
    canAdvanceEditorStep(
      { ...valid(), city: "", startTime: "", vatPercentage: undefined },
      false,
      0,
      now,
    ),
    true,
  );
  for (const patch of [
    { city: "" },
    { googlePlaceId: "" },
    { latitude: NaN },
    { startTime: "" },
    { endTime: valid().startTime },
  ])
    assert.equal(
      canAdvanceEditorStep({ ...valid(), ...patch }, false, 1, now),
      false,
    );
  assert.equal(
    canAdvanceEditorStep(
      { ...valid(), vatPercentage: undefined },
      false,
      1,
      now,
    ),
    true,
  );
});

test("wizard blocks empty basics without showing schedule or VAT errors", () => {
  const errors = errorsForStep(editorErrors(emptyEvent(), false, now), 0);
  assert.deepEqual(Object.keys(errors).sort(), [
    "description",
    "title",
    "vibe",
  ]);
  assert.deepEqual(errorDestination(errors, false), {
    step: 0,
    section: "details",
  });
  const draft = {
    ...valid(),
    startTime: "",
    endTime: "",
    vatPercentage: undefined,
  };
  assert.deepEqual(errorsForStep(editorErrors(draft, false, now), 0), {});
});

test("schedule requires valid venue coordinates and chronological dates", () => {
  const errors = errorsForStep(
    editorErrors(
      {
        ...valid(),
        latitude: NaN,
        longitude: 181,
        googlePlaceId: "",
        endTime: "2026-10-15T20:00",
      },
      false,
      now,
    ),
    1,
  );
  assert.deepEqual(Object.keys(errors).sort(), [
    "endTime",
    "latitude",
    "locationName",
    "longitude",
  ]);
  assert.deepEqual(errorDestination(errors, false), {
    step: 1,
    section: "details",
  });
  assert.deepEqual(editorErrors(valid(), false, now), {});
});

test("hidden lineup errors prevent Next and target lineup in edit", () => {
  const draft = {
    ...valid(),
    lineup: [{ name: "", source: "MANUAL" as const }],
  };
  const errors = errorsForStep(editorErrors(draft, false, now), 0);
  assert.equal(errors["lineup.0"], "formValidation.artistNameRequired");
  assert.deepEqual(errorDestination(errors, true), {
    step: 0,
    section: "lineup",
  });
  assert.deepEqual(errorDestination({ title: "invalid", ...errors }, true), {
    step: 0,
    section: "details",
  });
});

test("ticket errors target fields and publication errors return to details during edit", () => {
  const errors = editorErrors(
    {
      ...valid(),
      ticketTypes: [
        { name: "A", priceRon: -1, capacity: 0, startSales: "", endSales: "" },
      ],
    },
    false,
    now,
  );
  assert.equal(errors["ticketTypes.0.name"], "formValidation.ticketNameShort");
  assert.equal(
    errors["ticketTypes.0.capacity"],
    "formValidation.capacityMinimum",
  );
  assert.equal(
    errors["ticketTypes.0.startSales"],
    "formValidation.salesStartRequired",
  );
  assert.equal(
    errors["ticketTypes.0.endSales"],
    "formValidation.salesEndRequired",
  );
  assert.deepEqual(errorDestination(errors, true), {
    step: 2,
    section: "tickets",
  });
  const publication = editorErrors(
    { ...valid(), status: "scheduled", publishAt: new Date(now).toISOString() },
    false,
    now,
  );
  assert.deepEqual(errorDestination(publication, true), {
    step: 2,
    section: "details",
  });
  assert.deepEqual(errorDestination(publication, false), {
    step: 2,
    section: "tickets",
  });
});

test("external mode requires HTTPS URL and never asks for internal VAT", () => {
  for (const url of [
    "",
    "http://tickets.example.test",
    "https://user:password@example.test",
    "garbage",
  ]) {
    const errors = editorErrors(
      { ...valid(), externalTicketUrl: url, vatPercentage: undefined },
      true,
      now,
    );
    assert.equal(errors.externalTicketUrl, "ticketForm.externalUrlRequired");
    assert.equal(errors.vatPercentage, undefined);
  }
  assert.deepEqual(
    editorErrors(
      {
        ...valid(),
        externalTicketUrl: "https://tickets.example.test/night",
        vatPercentage: undefined,
      },
      true,
      now,
    ),
    {},
  );
});

test("changing lineup time preserves data and sorts unset times after scheduled artists", () => {
  const original = [
    { name: "Late", performanceTime: "23:00" },
    { name: "Unset", performanceTime: "" },
    { name: "Early", performanceTime: "22:00" },
  ];
  const updated = updateLineupTime(original, 0, "21:00");
  assert.deepEqual(
    updated.map((a) => a.name),
    ["Late", "Early", "Unset"],
  );
  assert.equal(original[0]?.performanceTime, "23:00");
});
