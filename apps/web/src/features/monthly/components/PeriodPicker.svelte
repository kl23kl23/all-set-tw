<script lang="ts">
  import type { Snippet } from "svelte";
  import { ChevronLeft, ChevronRight } from "@lucide/svelte";
  import Badge from "@/shared/ui/Badge.svelte";
  import Button from "@/shared/ui/Button.svelte";
  import Select from "@/shared/ui/Select.svelte";
  import {
    formatPeriodLabel,
    formatPeriodRange,
    statementPeriod,
  } from "../model/period";

  let {
    periodKeys,
    currentPeriod,
    selected,
    onChange,
    trailing,
  }: {
    periodKeys: string[];
    currentPeriod: string;
    selected: string;
    onChange: (key: string) => void;
    /** Shown to the right of the picker, below it on narrow screens. */
    trailing?: Snippet;
  } = $props();

  const period = $derived(statementPeriod(selected));

  function shift(offset: number) {
    const next = periodKeys[periodKeys.indexOf(selected) + offset];
    if (next) onChange(next);
  }
</script>

<div
  class="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
>
  <div class="min-w-0">
    <div class="flex min-w-0 items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        aria-label="上一期"
        disabled={selected === periodKeys[0]}
        onclick={() => shift(-1)}><ChevronLeft class="size-5" /></Button
      >
      <Select
        aria-label="選擇結算月份"
        class="h-11 min-w-0 flex-1 font-semibold sm:w-auto sm:flex-none"
        value={selected}
        onchange={(event: Event) =>
          onChange((event.currentTarget as HTMLSelectElement).value)}
        >{#each [...periodKeys].reverse() as key (key)}<option value={key}
            >{formatPeriodLabel(key)}（{formatPeriodRange(
              statementPeriod(key),
            )}）</option
          >{/each}</Select
      >
      <Button
        variant="outline"
        size="icon"
        aria-label="下一期"
        disabled={selected === currentPeriod}
        onclick={() => shift(1)}><ChevronRight class="size-5" /></Button
      >
    </div>
    <p class="mt-2 flex items-center gap-2 text-caption text-subtle">
      每月 15 日結算 · {period.start.replaceAll(
        "-",
        "/",
      )}～{period.end.replaceAll("-", "/")}
      {#if selected === currentPeriod}<Badge>進行中</Badge>{/if}
    </p>
  </div>
  {@render trailing?.()}
</div>
