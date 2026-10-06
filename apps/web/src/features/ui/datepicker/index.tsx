"use client";

import { UilArrowLeft, UilArrowRight } from "@tooni/iconscout-unicons-react";
import { Button } from "@ui/button";
import { FormControl } from "@ui/input";
import { clsx } from "clsx";
import dayjs from "@/utils/dayjs";
import i18next from "i18next";
import { useMemo, useState } from "react";
import { DatepickerCell } from "./datepicker-cell";

interface Props {
  value: Date | undefined;
  minDate: Date | undefined;
  onChange: (value: Date) => void;
}

export function Datepicker(props: Props) {
  const [calendarValue, setCalendarValue] = useState<Date>(
    dayjs(props.value ?? new Date()).date(1).toDate()
  );

  const monthFormat = useMemo(
    () =>
      typeof Intl !== "undefined" && typeof Intl.DateTimeFormat === "function"
        ? Intl.DateTimeFormat(i18next.language, { month: "long" })
        : {
            format: (date: Date) =>
              date.toDateString().split(" ")[1] ?? ""
          },
    []
  );
  const currentMonth = useMemo(
    () => monthFormat.format(calendarValue),
    [monthFormat, calendarValue]
  );

  const weekdaysFormat = useMemo(
    () =>
      typeof Intl !== "undefined" && typeof Intl.DateTimeFormat === "function"
        ? Intl.DateTimeFormat(i18next.language, { weekday: "short" })
        : {
            format: (date: Date) => date.toDateString().substring(0, 3)
          },
    []
  );
  const monthDays = useMemo(() => {
    const monthStartDate = dayjs(calendarValue).startOf("month");
    const monthEndDate = dayjs(calendarValue).endOf("month");

    // The first weekday follows the active dayjs locale (Monday for most)
    const weekStartDate = monthStartDate.startOf("week");
    const endWeekDate = monthEndDate.endOf("week");

    const allDates: Date[] = [];
    const nowHour = dayjs().hour();

    let temp = weekStartDate.clone();
    while (temp.date() !== endWeekDate.date() || temp.month() !== endWeekDate.month()) {
      allDates.push(temp.toDate());
      temp = temp.add(1, "day").hour(nowHour);
    }
    allDates.push(temp.toDate());
    return allDates;
  }, [calendarValue]);
  // Label the header from the grid's own first week so columns always match
  // whichever weekday the locale starts on.
  const weekdays = useMemo(
    () => monthDays.slice(0, 7).map((day) => weekdaysFormat.format(day)),
    [monthDays, weekdaysFormat]
  );

  const hours = useMemo(() => new Array(24).fill(1).map((_, i) => i), []);
  const minutes = useMemo(() => new Array(60).fill(1).map((_, i) => i), []);

  return (
    <div className="ecency-datepicker">
      <div className="flex justify-between items-center gap-4">
        <div className="capitalize md:text-xl lg:text-2xl">
          <b>{currentMonth}</b> {calendarValue.getFullYear()}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="xs"
            appearance="gray"
            onClick={() => setCalendarValue(dayjs(calendarValue).subtract(1, "month").toDate())}
            icon={<UilArrowLeft />}
            aria-label={i18next.t("datepicker.prev-month", { defaultValue: "Previous month" })}
          />
          <Button size="xs" appearance="gray" onClick={() => setCalendarValue(new Date())}>
            {i18next.t("g.today")}
          </Button>
          <Button
            size="xs"
            appearance="gray"
            onClick={() => setCalendarValue(dayjs(calendarValue).add(1, "month").toDate())}
            icon={<UilArrowRight />}
            aria-label={i18next.t("datepicker.next-month", { defaultValue: "Next month" })}
          />
        </div>
      </div>
      <div className="grid grid-cols-7 gap-4 text-sm text-center">
        {weekdays.map((weekday) => (
          <div
            className="text-gray-500 dark:text-gray-600 uppercase pt-6 flex items-center justify-center"
            key={weekday}
          >
            {weekday}
          </div>
        ))}
        {monthDays.map((day) => (
          <DatepickerCell
            key={`${day.getDate()}-${day.getMonth()}-${day.getFullYear()}`}
            calendarValue={calendarValue}
            value={props.value}
            day={day}
            onPick={props.onChange}
          />
        ))}
      </div>

      <div className="flex justify-center gap-4 mt-4 border-t border-[--border-color] pt-4 -mx-2 md:-mx-4">
        <FormControl
          type="select"
          className="max-w-[100px]"
          value={dayjs(props.value ?? calendarValue).hour()}
          onChange={(e) =>
            props.onChange(
              dayjs(props.value ?? calendarValue)
                .hour(parseInt((e.target as any).value))
                .toDate()
            )
          }
        >
          {hours.map((hour) => (
            <option key={hour} value={hour}>
              {hour}
            </option>
          ))}
        </FormControl>
        <FormControl
          type="select"
          className="max-w-[100px]"
          value={dayjs(props.value ?? calendarValue).minute()}
          onChange={(e) =>
            props.onChange(
              dayjs(props.value ?? calendarValue)
                .minute(parseInt((e.target as any).value))
                .toDate()
            )
          }
        >
          {minutes.map((min) => (
            <option key={min} value={min}>
              {min}
            </option>
          ))}
        </FormControl>
      </div>
    </div>
  );
}
