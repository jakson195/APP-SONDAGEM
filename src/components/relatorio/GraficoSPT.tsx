import { LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";

const data = [
  { profundidade: 1, nspt: 5 },
  { profundidade: 2, nspt: 10 },
];

export function GraficoSPT() {
  return (
    <div className="bg-white p-1 text-[10px]">
      <p className="text-center font-bold">Grafico NSPT</p>
      <LineChart width={200} height={400} data={data}>
        <XAxis type="number" dataKey="nspt" />
        <YAxis dataKey="profundidade" reversed />
        <Tooltip />
        <Line type="monotone" dataKey="nspt" />
      </LineChart>
    </div>
  );
}
