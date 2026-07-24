import { Plus, Ticket as TicketIcon, Trash2 } from "lucide-react";
import { useFieldArray, UseFormReturn } from "react-hook-form";
import { useEffect, useState } from "react";
import { EventFormValues } from "@/app/dashboard/components/EventsForm";
import { useDataProvider } from "@/core/DataProviderContext";
import { eventInputClass, FormField, StepperInput } from "@/features/events/form/FormField";
import { DateTimePicker } from "@/features/events/form/DateTimePicker";

export function TicketTypesSection({ form }: { form: UseFormReturn<EventFormValues> }) {
  const { user } = useDataProvider();
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "ticketTypes" });
  const ticketTypes = form.watch("ticketTypes");
  const { errors } = form.formState;
  const [canAddTickets, setCanAddTickets] = useState(false);

  useEffect(() => {
    if (!user) return;

    user.getOrganizerProfile()
      .then((profile) => setCanAddTickets(Boolean(profile?.stripeChargesEnabled && profile?.stripePayoutsEnabled)))
      .catch(() => setCanAddTickets(false));
  }, [user]);

  return (
    <section className="rounded-3xl border border-white/[0.06] bg-white/[0.02] p-5">
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground/80"><TicketIcon className="h-4 w-4 text-primary" /> Tipuri de bilete</h2>
          <p className="mt-0.5 max-w-[500px] text-[11px] text-muted-foreground/50">Seteaza pretul, stocul si perioada de vanzare pentru fiecare tip.</p>
        </div>
        <button type="button" onClick={() => append({ name: "", priceRon: 0, capacity: 50, description: "", startSales: "", endSales: "" })} disabled={!canAddTickets} title={canAddTickets ? "Adauga tip de bilet" : "Configureaza Stripe pentru a adauga bilete"} className="inline-flex h-10 w-full shrink-0 items-center justify-center gap-1 rounded-full bg-primary/10 px-3 text-xs font-semibold text-primary transition hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-40 sm:h-auto sm:w-auto sm:py-1.5">
          <Plus className="h-3.5 w-3.5" /> Adauga tip
        </button>
      </div>
      {!canAddTickets && <p className="mt-2 text-[11px] text-amber-400/80">Activeaza Stripe din dashboard pentru a adauga tipuri de bilete.</p>}
      {errors.ticketTypes?.message && <p className="mt-2 text-xs font-medium text-red-400">{errors.ticketTypes.message}</p>}
      <div className="mt-4 space-y-3">
        {fields.map((field, index) => (
          <div key={field.id} className="relative rounded-2xl border border-white/[0.05] bg-white/[0.01] p-4">
            <input type="hidden" {...form.register(`ticketTypes.${index}.id`)} />
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1">
                <input {...form.register(`ticketTypes.${index}.name`)} placeholder="Nume (ex: General Admission, VIP)" className={eventInputClass} />
                {errors.ticketTypes?.[index]?.name?.message && <p className="mt-1 px-2 text-[11px] text-red-400">{errors.ticketTypes[index].name.message}</p>}
              </div>
              <button type="button" onClick={() => remove(index)} className="shrink-0 rounded-full p-2 text-muted-foreground/60 transition hover:bg-white/5 hover:text-red-400" aria-label="Sterge tip bilet"><Trash2 className="h-4 w-4" /></button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <FormField label="Pret (RON)" compact error={errors.ticketTypes?.[index]?.priceRon?.message}>
                <StepperInput value={(ticketTypes?.[index]?.priceRon as number) ?? 0} onChange={(value) => form.setValue(`ticketTypes.${index}.priceRon`, value, { shouldValidate: true })} step={10} min={0} />
              </FormField>
              <FormField label="Stoc maximum" compact error={errors.ticketTypes?.[index]?.capacity?.message}>
                <StepperInput value={(ticketTypes?.[index]?.capacity as number) ?? 0} onChange={(value) => form.setValue(`ticketTypes.${index}.capacity`, value, { shouldValidate: true })} step={10} min={1} />
              </FormField>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <FormField label="Start vanzare" compact error={errors.ticketTypes?.[index]?.startSales?.message}>
                <DateTimePicker value={ticketTypes?.[index]?.startSales || ""} onChange={(startSales) => form.setValue(`ticketTypes.${index}.startSales`, startSales, { shouldValidate: true, shouldDirty: true })} placeholder="Alege startul" />
                <input type="hidden" {...form.register(`ticketTypes.${index}.startSales`)} />
              </FormField>
              <FormField label="Final vanzare" compact error={errors.ticketTypes?.[index]?.endSales?.message}>
                <DateTimePicker value={ticketTypes?.[index]?.endSales || ""} onChange={(endSales) => form.setValue(`ticketTypes.${index}.endSales`, endSales, { shouldValidate: true, shouldDirty: true })} placeholder="Alege finalul" />
                <input type="hidden" {...form.register(`ticketTypes.${index}.endSales`)} />
              </FormField>
            </div>
            <div className="mt-3">
              <input {...form.register(`ticketTypes.${index}.description`)} placeholder="Descriere scurta optionala" className={eventInputClass} />
              {errors.ticketTypes?.[index]?.description?.message && <p className="mt-1 px-2 text-[11px] text-red-400">{errors.ticketTypes[index].description.message}</p>}
            </div>
            {field.ticketsSold !== undefined && field.ticketsSold > 0 && <p className="mt-2 inline-block rounded-full border border-white/[0.04] bg-white/[0.02] px-2.5 py-1 text-[11px] font-medium text-muted-foreground/60">Vandute pana acum: <span className="font-semibold text-white">{field.ticketsSold}</span></p>}
          </div>
        ))}
      </div>
    </section>
  );
}
