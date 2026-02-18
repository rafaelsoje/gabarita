export default function SubscriptionPage() {
  return (
    <main className="dashboard">
      <section className="dashboardCard subscriptionHeader">
        <h1>Assinatura</h1>
        <button className="button subscriptionManageBtn" type="button">
          Gerenciar
        </button>
      </section>

      <section className="dashboardCard subscriptionSummaryCard">
        <div className="subscriptionPlanCol">Anual</div>
        <div className="subscriptionInfoCol">
          <p>
            <strong>Vencimento:</strong> 28/01/2027 <span className="dotSep">•</span> <span className="statusCanceled">Cancelado</span>
          </p>
          <p>
            <strong>Adesão:</strong> 28/01/2026
          </p>
          <p>
            <strong>Tempo restante de assinatura:</strong> 11m 18 dias
          </p>
        </div>
        <div className="subscriptionInfoCol">
          <p>
            <strong>Próximo pagamento:</strong> 28/01/2027
          </p>
          <p>
            <strong>Valor:</strong> R$237.60
          </p>
          <p>
            <strong>Forma de pagamento:</strong> Cartão de Crédito
          </p>
        </div>
      </section>

      <section className="dashboardCard subscriptionHistoryCard">
        <h2>Histórico de compras</h2>
        <div className="subscriptionTableWrap">
          <table className="subscriptionTable">
            <thead>
              <tr>
                <th>Data</th>
                <th>Provedor</th>
                <th>Assinatura</th>
                <th>Período do Serviço</th>
                <th>Status</th>
                <th>Forma de Pagamento</th>
                <th>Recorrência</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>28/01/2026</td>
                <td>Guru/Pagar.me</td>
                <td>Anual</td>
                <td>28/01/2026 - 28/01/2027</td>
                <td className="statusCanceled">Cancelado</td>
                <td>Cartão de Crédito</td>
                <td>Não</td>
                <td>R$237.60</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
