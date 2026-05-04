export function TabelaSPT() {
  return (
    <table className="w-full border-collapse border border-gray-400 bg-white text-[10px]">
      <thead>
        <tr className="border border-gray-400">
          <th>Prof</th>
          <th>N1</th>
          <th>N2</th>
          <th>N3</th>
          <th>NSPT</th>
        </tr>
      </thead>

      <tbody>
        {[1, 2, 3, 4].map((i) => (
          <tr key={i} className="border border-gray-400">
            <td>{i}.00</td>
            <td>2</td>
            <td>5</td>
            <td>6</td>
            <td>{5 + 6}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
