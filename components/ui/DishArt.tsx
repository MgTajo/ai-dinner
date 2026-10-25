import { memo } from "react";
import { View } from "react-native";
import Svg, { Circle, G, Line, Path, Rect } from "react-native-svg";
import { hash } from "../../lib/agent/format";
import type { MenuItem, Restaurant } from "../../lib/agent/types";
import { T } from "./primitives";
import { color, font, radius } from "./theme";

// Top-down dish illustrations drawn from each dish's ingredient colours. One consistent visual
// language across the menu, no stock photography, and it works offline.

const S = 100;
const C = S / 2;

function rng(seed: string) {
  let s = hash(seed) || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

function sector(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const x0 = cx + r * Math.cos(a0);
  const y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
}

function Dots({ rand, n, r, cx, cy, spread, fill }: { rand: () => number; n: number; r: number; cx: number; cy: number; spread: number; fill: string }) {
  return (
    <G>
      {Array.from({ length: n }, (_, i) => {
        const a = rand() * Math.PI * 2;
        const d = Math.sqrt(rand()) * spread;
        return <Circle key={i} cx={cx + Math.cos(a) * d} cy={cy + Math.sin(a) * d} r={r * (0.7 + rand() * 0.6)} fill={fill} />;
      })}
    </G>
  );
}

function Bowl({ item, rand }: { item: MenuItem; rand: () => number }) {
  const [base, ...rest] = [...item.palette].reverse();
  const toppings = rest.reverse();
  const n = Math.max(3, toppings.length);
  const offset = rand() * Math.PI * 2;
  const soup = item.type === "noodles" || item.type === "soup" || item.type === "curry";
  return (
    <G>
      <Circle cx={C} cy={C + 1.5} r={45} fill="rgba(23,22,20,0.06)" />
      <Circle cx={C} cy={C} r={45} fill="#F3EEE6" />
      <Circle cx={C} cy={C} r={45} fill="none" stroke="#E2DACD" strokeWidth={1} />
      <Circle cx={C} cy={C} r={37} fill={soup ? item.palette[0] : base} />
      {soup ? (
        <G>
          {Array.from({ length: 5 }, (_, i) => (
            <Path key={i} d={`M ${22 + i * 2} ${38 + i * 6} q 14 -6 28 0 t 28 0`} stroke={item.palette[2] ?? "#EED9A0"} strokeWidth={2.4} fill="none" strokeLinecap="round" opacity={0.9} />
          ))}
          {toppings.slice(1).map((c, i) => {
            const a = offset + (i / Math.max(1, toppings.length - 1)) * Math.PI * 1.6;
            return <Circle key={i} cx={C + Math.cos(a) * 17} cy={C + Math.sin(a) * 17} r={8} fill={c} />;
          })}
        </G>
      ) : (
        <G>
          {Array.from({ length: n }, (_, i) => {
            const a0 = offset + (i / (n + 1)) * Math.PI * 2;
            const a1 = a0 + (Math.PI * 2) / (n + 1) - 0.12;
            return <Path key={i} d={sector(C, C, 34, a0, a1)} fill={toppings[i % toppings.length]} />;
          })}
          <Circle cx={C} cy={C} r={9} fill={toppings[toppings.length - 1] ?? base} />
        </G>
      )}
      <Dots rand={rand} n={14} r={0.9} cx={C} cy={C} spread={30} fill="rgba(255,255,255,0.75)" />
    </G>
  );
}

function Plate({ item, rand }: { item: MenuItem; rand: () => number }) {
  const blobs = item.palette.flatMap((c, i) => Array.from({ length: i === 0 ? 4 : 3 }, () => c));
  return (
    <G>
      <Circle cx={C} cy={C + 1.5} r={46} fill="rgba(23,22,20,0.06)" />
      <Circle cx={C} cy={C} r={46} fill="#FBF9F5" />
      <Circle cx={C} cy={C} r={37} fill="none" stroke="#ECE6DC" strokeWidth={1.2} />
      {item.type === "pasta"
        ? Array.from({ length: 7 }, (_, i) => (
            <Circle key={i} cx={C + (rand() - 0.5) * 10} cy={C + (rand() - 0.5) * 10} r={8 + i * 3} fill="none" stroke={item.palette[0]} strokeWidth={3.2} opacity={0.95} />
          ))
        : null}
      {blobs.map((c, i) => {
        const a = rand() * Math.PI * 2;
        const d = Math.sqrt(rand()) * (item.type === "pasta" ? 16 : 22);
        return <Circle key={i} cx={C + Math.cos(a) * d} cy={C + Math.sin(a) * d} r={item.type === "pasta" ? 4 + rand() * 3 : 7 + rand() * 6} fill={c} opacity={item.type === "pasta" && i < 4 ? 0 : 1} />;
      })}
      <Dots rand={rand} n={10} r={1.1} cx={C} cy={C} spread={24} fill={item.palette[item.palette.length - 1]} />
    </G>
  );
}

function Pizza({ item, rand }: { item: MenuItem; rand: () => number }) {
  const [sauce, cheese, topping] = item.palette;
  return (
    <G>
      <Circle cx={C} cy={C + 1.5} r={45} fill="rgba(23,22,20,0.07)" />
      <Circle cx={C} cy={C} r={45} fill="#D9A867" />
      <Circle cx={C} cy={C} r={38} fill={sauce} />
      <Dots rand={rand} n={9} r={8} cx={C} cy={C} spread={26} fill={cheese} />
      {topping ? <Dots rand={rand} n={11} r={3.6} cx={C} cy={C} spread={30} fill={topping} /> : null}
      {Array.from({ length: 4 }, (_, i) => {
        const a = (i / 4) * Math.PI;
        return <Line key={i} x1={C - Math.cos(a) * 45} y1={C - Math.sin(a) * 45} x2={C + Math.cos(a) * 45} y2={C + Math.sin(a) * 45} stroke="rgba(120,70,30,0.35)" strokeWidth={0.8} />;
      })}
    </G>
  );
}

function Burger({ item, rand }: { item: MenuItem; rand: () => number }) {
  const [bun, , cheese] = item.palette;
  return (
    <G>
      <Circle cx={C} cy={C + 1.5} r={46} fill="rgba(23,22,20,0.06)" />
      <Circle cx={C} cy={C} r={46} fill="#FBF9F5" />
      {Array.from({ length: 9 }, (_, i) => (
        <Rect key={i} x={66 + (i % 3) * 6} y={28 + i * 4.5} width={20} height={3.6} rx={1.8} fill="#E8B65A" transform={`rotate(${-20 + rand() * 40} ${76} ${30 + i * 4.5})`} />
      ))}
      <Circle cx={42} cy={C} r={28} fill={cheese} />
      <Circle cx={42} cy={C - 1} r={26} fill={bun} />
      <Dots rand={rand} n={12} r={1.1} cx={42} cy={C - 2} spread={18} fill="#FBF3E2" />
    </G>
  );
}

function Board({ item, rand }: { item: MenuItem; rand: () => number }) {
  const [a, b, c, d] = item.palette;
  const content = () => {
    switch (item.type) {
      case "sushi":
        return Array.from({ length: 6 }, (_, i) => {
          const x = 18 + (i % 3) * 23;
          const y = 30 + Math.floor(i / 3) * 24;
          return (
            <G key={i}>
              <Rect x={x} y={y} width={19} height={16} rx={5} fill={c ?? "#F3EEE2"} />
              <Rect x={x + 1} y={y + 1} width={17} height={9} rx={4} fill={i % 2 ? b : a} />
              {i >= 3 ? <Rect x={x} y={y} width={19} height={16} rx={5} fill="none" stroke={d ?? "#2F3B2E"} strokeWidth={2.4} /> : null}
            </G>
          );
        });
      case "tacos":
        return [0, 1, 2].map((i) => (
          <G key={i} transform={`translate(${16 + i * 24} ${30})`}>
            <Path d="M 0 22 A 12 22 0 0 1 24 22 Z" fill={a} transform="rotate(0)" />
            <Dots rand={rand} n={6} r={2.6} cx={12} cy={14} spread={7} fill={i % 2 ? c : b} />
          </G>
        ));
      case "bao":
        return [0, 1].map((i) => (
          <G key={i} transform={`translate(${18 + i * 34} ${28})`}>
            <Path d="M 0 22 Q 0 0 15 0 Q 30 0 30 22 Z" fill={a} />
            <Rect x={1} y={18} width={28} height={7} rx={3} fill={b} />
            <Dots rand={rand} n={4} r={1.8} cx={15} cy={20} spread={8} fill={c} />
            <Path d="M 0 24 Q 15 30 30 24 Z" fill={a} />
          </G>
        ));
      case "wrap":
        return [0, 1].map((i) => (
          <G key={i}>
            <Circle cx={34 + i * 32} cy={C} r={15} fill={a} />
            <Circle cx={34 + i * 32} cy={C} r={11} fill={b} />
            <Circle cx={34 + i * 32} cy={C} r={6.5} fill={c} />
            <Circle cx={34 + i * 32} cy={C} r={2.5} fill={d ?? a} />
          </G>
        ));
      default:
        return [0, 1].map((i) => (
          <G key={i} transform={`translate(${16 + i * 34} ${26}) ${i ? "rotate(180 17 22)" : ""}`}>
            <Path d="M 0 44 L 34 44 L 0 0 Z" fill={a} />
            <Path d="M 3 40 L 28 40 L 3 8 Z" fill={b} />
            <Path d="M 5 37 L 20 37 L 5 18 Z" fill={c ?? b} />
          </G>
        ));
    }
  };
  return (
    <G>
      <Rect x={6} y={14} width={88} height={72} rx={14} fill="rgba(23,22,20,0.06)" />
      <Rect x={6} y={12} width={88} height={72} rx={14} fill="#E4CCA4" />
      <Rect x={6} y={12} width={88} height={72} rx={14} fill="none" stroke="#D5B98C" strokeWidth={1} />
      {content()}
    </G>
  );
}

function Art({ item }: { item: MenuItem }) {
  const rand = rng(item.id);
  switch (item.type) {
    case "pizza":
      return <Pizza item={item} rand={rand} />;
    case "burger":
      return <Burger item={item} rand={rand} />;
    case "sushi":
    case "tacos":
    case "bao":
    case "wrap":
    case "sandwich":
      return <Board item={item} rand={rand} />;
    case "salad":
    case "pasta":
    case "grill":
      return <Plate item={item} rand={rand} />;
    default:
      return <Bowl item={item} rand={rand} />;
  }
}

export const DishArt = memo(function DishArt({ item, size = 64, rounded = radius.md, tint = "#EFEAE1" }: { item: MenuItem; size?: number; rounded?: number; tint?: string }) {
  return (
    <View style={{ width: size, height: size, borderRadius: rounded, backgroundColor: tint, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <Svg width={size * 0.86} height={size * 0.86} viewBox={`0 0 ${S} ${S}`}>
        <Art item={item} />
      </Svg>
    </View>
  );
});

export function RestaurantMark({ restaurant, size = 40 }: { restaurant: Restaurant; size?: number }) {
  const words = restaurant.name.replace(/[^A-Za-z0-9& ]/g, "").split(" ").filter((w) => w !== "&");
  const initials = /\d/.test(restaurant.name) ? restaurant.name.replace(/\D/g, "") : words.length > 1 && words[1].length > 2 ? `${words[0][0]}${words[1][0]}` : words[0][0];
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: restaurant.tint, alignItems: "center", justifyContent: "center" }}>
      <T style={{ fontFamily: font.display, fontSize: size * (initials.length > 1 ? 0.42 : 0.55), lineHeight: size * 0.62, color: "#FFFFFF", letterSpacing: -0.3 }}>{initials}</T>
    </View>
  );
}

export function PlatformDot({ dot, size = 7 }: { dot: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: dot }} />;
}

export const artTint = color.sunken;
