<script lang="ts">
  import type { PageData } from "./$types";
  import { CalendarDate } from "@internationalized/date";
  import * as Accordion from "$lib/components/ui/accordion";
  import Markdown from "$lib/components/Markdown.svelte";
  import { TRAIN } from "$lib/perms/permissions";
  import { can } from "$lib/perms/can";

  export let data: PageData;

  function convertDate(date: Date): string {
    return date.toDateString();
  }
</script>

<div class="flex items-center justify-between space-y-2">
  <h2 class="text-3xl font-bold tracking-tight">
    Training Transcript for {data.targetUser.name}
  </h2>
</div>

<Accordion.Root>
  {#each data.sessions as session}
    <Accordion.Item value={session.id}>
      <Accordion.Trigger>
        {convertDate(session.date)} - {session.sessionType} session with {session
          .instructor.name}
      </Accordion.Trigger>
      <Accordion.Content>
        <div class="grid-cols-{can(TRAIN) ? '2' : '1'} grid gap-4">
          <div>
            <p class="font-semibold text-foreground/40">COMMENTS</p>
            <div
              class="mt-2 relative rounded bg-muted p-[0.5rem] text-sm mb-5 overflow-auto h-[150px]">
              <Markdown src={session.studentComments} />
            </div>
          </div>
          {#if can(TRAIN)}
            <div>
              <p class="font-semibold text-foreground/40">
                PRIVATE MENTOR NOTES
              </p>
              <div
                class="mt-2 relative rounded bg-muted p-[0.5rem] text-sm mb-5 overflow-auto h-[150px]">
                <Markdown src={session.instructorComments} />
              </div>
            </div>
          {/if}
        </div>
      </Accordion.Content>
    </Accordion.Item>
  {/each}
</Accordion.Root>
