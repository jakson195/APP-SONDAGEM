useEffect(() => {
  if (!comFuro) return;

  const run = async () => {
    setNomePersistReady(true);
    await carregarFuro();
  };

  run();
}, [comFuro, carregarFuro]);

useEffect(() => {
  if (comFuro) return;

  setCampoMapaReady(true);

  const v = localStorage.getItem(LS_TRADO_NOME);
  if (v !== null) {
    setCodigoFuro(v);
  }

  setNomePersistReady(true);
}, [comFuro]);