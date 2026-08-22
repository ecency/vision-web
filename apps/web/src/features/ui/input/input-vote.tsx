"use client";

import { Input } from "@ui/input/form-controls/input";
import React, {
  MouseEvent,
  PropsWithChildren,
  TouchEvent,
  useEffect,
  useRef,
  useState
} from "react";
import { UilArrowDown, UilArrowUp } from "@tooni/iconscout-unicons-react";
import { InputGroup } from "@ui/input/input-group";
import useInterval from "react-use/lib/useInterval";
import { classNameObject } from "@ui/util";

interface Props {
  value: number;
  setValue: (v: number) => void;
  mode?: "positive" | "negative";
}

function ArrowButton({ children, onClick }: PropsWithChildren<{ onClick: () => void }>) {
  const [fireInterval, setFireInterval] = useState(false);

  useInterval(() => onClick(), fireInterval ? 300 : null);

  return (
    <div
      className="cursor-pointer h-4 flex items-center text-blue-dark-sky opacity-75 hover:opacity-100"
      role="button"
      tabIndex={0}
      onClick={() => {
        setFireInterval(false);
        onClick();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setFireInterval(false);
          onClick();
        }
      }}
      onMouseDown={() => setFireInterval(true)}
    >
      {children}
    </div>
  );
}

export function InputVote({ value, setValue, mode = "positive" }: Props) {
  const mouseDownInitiatedRef = useRef(false);

  const [startPosition, setStartPosition] = useState(0);
  const [originalValue, setOriginalValue] = useState(0);

  useEffect(() => {
    if (value < 0) {
      setValue(0);
    } else if (value > 100) {
      setValue(100);
    } else {
      setValue(value);
    }
  }, [setValue, value]);

  const onTouchMove = (e: TouchEvent) => {
    const touch = e.touches.item(0);
    if (touch) {
      const diff = Math.max(-200, Math.min(200, touch.clientX - startPosition));
      setValue(Math.min(100, Math.max(0, originalValue + diff)));
    }
  };

  const onMouseMove = (e: MouseEvent) => {
    if (mouseDownInitiatedRef.current) {
      const diff = Math.max(-200, Math.min(200, e.clientX - startPosition));
      setValue(Math.min(100, Math.max(0, originalValue + diff)));
    }
  };

  return (
    <div
      className="ecency-vote-input rounded-full overflow-hidden relative"
      role="slider"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      tabIndex={0}
      onTouchStart={(e) => {
        setStartPosition(e.touches.item(0)?.clientX);
        setOriginalValue(value);
        document.body.classList.add("overflow-hidden");
      }}
      onTouchMove={onTouchMove}
      onTouchEnd={() => document.body.classList.remove("overflow-hidden")}
      onMouseDown={(e) => {
        mouseDownInitiatedRef.current = true;
        setStartPosition(e.clientX);
        setOriginalValue(value);
      }}
      onMouseMove={onMouseMove}
      onMouseUp={(e) => (mouseDownInitiatedRef.current = false)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "ArrowRight" || e.key === "ArrowUp") {
          e.preventDefault();
          setValue(Math.min(100, value + 1));
        } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
          e.preventDefault();
          setValue(Math.max(0, value - 1));
        }
      }}
    >
      <InputGroup append="%" className="relative z-10">
        <Input
          min={0}
          max={100}
          type="number"
          step="0.1"
          value={value}
          onChange={(e) => setValue(+e.target.value)}
        />
      </InputGroup>

      <div
        className={classNameObject({
          "absolute bg-opacity-25 top-[1px] left-[1px] bottom-[1px]": true,
          "bg-blue-dark-sky": mode === "positive",
          "bg-red": mode === "negative"
        })}
        style={{
          width: `${value * 0.86}%`
        }}
      />

      <div className="absolute z-[11] right-10 top-0 bottom-0 flex flex-col justify-center items-center">
        <ArrowButton onClick={() => setValue(value + 0.1)}>
          <UilArrowUp className="size-3.5" />
        </ArrowButton>
        <ArrowButton onClick={() => setValue(value - 0.1)}>
          <UilArrowDown className="size-3.5" />
        </ArrowButton>
      </div>
    </div>
  );
}
