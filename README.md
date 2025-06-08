# NFT Marketplace Analytics Subgraph

Subgraph tối ưu cho analytics theo **ngày**, **tuần** và **tổng cộng**.

## 🎯 Tính năng

- **📊 Analytics theo thời gian**: Daily/Weekly/All-time 
- **💰 Volume tracking**: Theo dõi volume giao dịch
- **📈 Price history**: OHLC data
- **⚡ Real-time updates**: Event-based

## 🚀 Deploy

```bash
npm run codegen
npm run build
npm run deploy
```

## 📊 Query Examples

### Marketplace Stats
```graphql
{
  marketplaceStat(id: "marketplace-stats") {
    totalVolume
    totalSales
    averagePrice
  }
}
```

### Daily Data
```graphql
{
  collectionDayDatas(first: 7, orderBy: date, orderDirection: desc) {
    date
    dailyVolume
    dailySales
    avgSalePrice
  }
}
```

### Top Collections
```graphql
{
  collections(first: 10, orderBy: totalVolume, orderDirection: desc) {
    id
    totalVolume
    totalSales
    floorPrice
  }
}
```

### Recent Sales
```graphql
{
  purchases(first: 10, orderBy: timestamp, orderDirection: desc) {
    price
    timestamp
    nftAddress
    tokenId
  }
}
``` 