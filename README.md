# NFT Marketplace Subgraph

Subgraph chuẩn cho NFT Marketplace với khả năng theo dõi metadata NFT (name, image, attributes).

## Tính năng

### 🎯 Các Entity chính

1. **NFT**: Thông tin chi tiết về từng NFT
   - Name, description, image từ metadata
   - Attributes/traits của NFT
   - Owner hiện tại
   - Token URI và collection

2. **NFTCollection**: Thông tin về các collection NFT
   - Name và symbol của collection
   - Total supply
   - Tự động track khi có NFT mới được list

3. **Listing**: Thông tin về các NFT được list bán
   - Liên kết với entity NFT
   - Thông tin seller, price, timestamp

4. **Purchase**: Lịch sử giao dịch mua bán
   - Liên kết với Listing và NFT
   - Thông tin buyer, seller, price

5. **User**: Thống kê người dùng
   - Số lượng listings, purchases, sales
   - Volume giao dịch
   - NFTs sở hữu

6. **MarketplaceStat**: Thống kê tổng quan marketplace

### 🔄 Dynamic Contract Tracking

Subgraph sử dụng **templates** để tự động theo dõi các NFT collections mới:
- Khi có NFT từ collection mới được list, subgraph tự động bắt đầu track Transfer events từ collection đó
- Không cần hardcode địa chỉ collection trong config

### 📊 Metadata Parsing

Subgraph có khả năng parse metadata JSON từ tokenURI:
- **Direct JSON**: `data:application/json,{...}`
- **Base64 JSON**: `data:application/json;base64,...`
- **External URLs**: IPFS, HTTP (set default values)

Tự động extract:
- `name`: Tên NFT
- `description`: Mô tả NFT  
- `image`: Link ảnh NFT
- `attributes`: Array các traits/properties

## Schema GraphQL

### Query Examples

```graphql
# Lấy tất cả NFTs với metadata
{
  nfts {
    id
    name
    description
    image
    tokenURI
    collection {
      name
      symbol
    }
    owner {
      address
    }
    attributes {
      traitType
      value
    }
  }
}

# Lấy listings đang active
{
  listings(where: {isSold: false}) {
    id
    price
    nft {
      name
      image
      collection {
        name
      }
    }
    seller
  }
}

# Thống kê marketplace
{
  marketplaceStats {
    totalCollections
    totalNFTs
    totalSales
    totalVolume
    averagePrice
  }
}
```

## Development

### Build và Deploy

```bash
# Generate types từ schema
npm run codegen

# Build subgraph
npm run build

# Deploy lên The Graph (cần setup auth trước)
npm run deploy
```

### Cấu trúc Files

```
src/
├── mapping.ts          # Handler cho NFTMarketplace events
├── nft-collection.ts   # Handler cho NFTCollection Transfer events
schema.graphql          # Định nghĩa entities
subgraph.yaml          # Config subgraph
abis/
├── NFTMarketplace.json
└── NFTCollection.json
```

## Features so với version cũ

✅ **Metadata NFT**: Name, image, attributes từ tokenURI
✅ **Dynamic tracking**: Tự động track collections mới
✅ **Better relationships**: Liên kết giữa NFT, Listing, Purchase
✅ **Rich queries**: Query theo collection, owner, attributes
✅ **Comprehensive stats**: Thống kê chi tiết hơn

## Lưu ý

- Metadata chỉ được parse cho inline JSON, external URLs cần handle ở frontend
- Template tracking chỉ bắt đầu khi có listing đầu tiên từ collection
- Để track từ mint event, cần thêm collection address vào `dataSources` 