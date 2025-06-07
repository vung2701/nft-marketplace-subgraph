import {
	NFTListed as NFTListedEvent,
	NFTBought as NFTBoughtEvent
} from '../generated/NFTMarketplace/NFTMarketplace'
import {
	Listing,
	Purchase,
	User,
	Collection,
	MarketplaceStat
} from '../generated/schema'
import { BigInt, Bytes, Address } from '@graphprotocol/graph-ts'

// Constants
let ZERO_BI = BigInt.fromI32(0)
let ONE_BI = BigInt.fromI32(1)
let MARKETPLACE_STAT_ID = "marketplace-stats"

/**
 * 📈 Handle NFT Listed Event
 */
export function handleNFTListed(event: NFTListedEvent): void {
	let listingId = event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
	let listing = new Listing(listingId)

	// Get or create user
	let user = getOrCreateUser(event.params.seller, event.block.timestamp)

	// Basic listing data
	listing.listingId = event.params.tokenId
	listing.seller = user.id
	listing.nftAddress = event.params.nftAddress
	listing.tokenId = event.params.tokenId
	listing.price = event.params.price
	listing.isSold = false
	listing.listedAt = event.block.timestamp
	listing.transactionHash = event.transaction.hash

	listing.save()

	// Update user stats
	user.totalListings = user.totalListings.plus(ONE_BI)
	user.lastActivityAt = event.block.timestamp
	user.save()

	// Update collection stats
	let collection = getOrCreateCollection(event.params.nftAddress)
	collection.totalListings = collection.totalListings.plus(ONE_BI)

	// Update floor price if this is lower
	if (collection.floorPrice.equals(ZERO_BI) || event.params.price.lt(collection.floorPrice)) {
		collection.floorPrice = event.params.price
	}
	collection.save()

	// Update marketplace stats
	let marketplaceStat = getOrCreateMarketplaceStat()
	marketplaceStat.totalListings = marketplaceStat.totalListings.plus(ONE_BI)
	marketplaceStat.totalActiveListings = marketplaceStat.totalActiveListings.plus(ONE_BI)
	marketplaceStat.updatedAt = event.block.timestamp
	marketplaceStat.save()
}

/**
 * 💰 Handle NFT Bought Event
 */
export function handleNFTBought(event: NFTBoughtEvent): void {
	let purchaseId = event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
	let purchase = new Purchase(purchaseId)

	// Get or create users
	let buyer = getOrCreateUser(event.params.buyer, event.block.timestamp)

	// Find corresponding listing
	let correspondingListing = findActiveListingForNFT(event.params.nftAddress, event.params.tokenId)
	let seller: User

	if (correspondingListing) {
		// Mark listing as sold
		correspondingListing.isSold = true
		correspondingListing.soldAt = event.block.timestamp
		correspondingListing.save()

		seller = User.load(correspondingListing.seller) as User
		purchase.listing = correspondingListing.id
	} else {
		// Fallback: create seller if no listing found
		seller = getOrCreateUser(event.params.buyer, event.block.timestamp) // Placeholder
	}

	// Create purchase record
	purchase.buyer = buyer.id
	purchase.seller = seller.id
	purchase.nftAddress = event.params.nftAddress
	purchase.tokenId = event.params.tokenId
	purchase.price = event.params.price
	purchase.timestamp = event.block.timestamp
	purchase.transactionHash = event.transaction.hash

	purchase.save()

	// Update buyer stats
	buyer.totalPurchases = buyer.totalPurchases.plus(ONE_BI)
	buyer.totalVolumeAsBuyer = buyer.totalVolumeAsBuyer.plus(event.params.price)
	buyer.lastActivityAt = event.block.timestamp
	buyer.save()

	// Update seller stats
	seller.totalSales = seller.totalSales.plus(ONE_BI)
	seller.totalVolumeAsSeller = seller.totalVolumeAsSeller.plus(event.params.price)
	seller.lastActivityAt = event.block.timestamp
	seller.save()

	// Update collection stats
	let collection = getOrCreateCollection(event.params.nftAddress)
	collection.totalSales = collection.totalSales.plus(ONE_BI)
	collection.totalVolume = collection.totalVolume.plus(event.params.price)
	collection.lastSalePrice = event.params.price
	collection.save()

	// Update marketplace stats
	let marketplaceStat = getOrCreateMarketplaceStat()
	marketplaceStat.totalSales = marketplaceStat.totalSales.plus(ONE_BI)
	marketplaceStat.totalVolume = marketplaceStat.totalVolume.plus(event.params.price)

	// Safely decrement active listings
	if (marketplaceStat.totalActiveListings.gt(ZERO_BI)) {
		marketplaceStat.totalActiveListings = marketplaceStat.totalActiveListings.minus(ONE_BI)
	}

	// Update average price
	if (marketplaceStat.totalSales.gt(ZERO_BI)) {
		marketplaceStat.averagePrice = marketplaceStat.totalVolume.div(marketplaceStat.totalSales)
	}

	marketplaceStat.updatedAt = event.block.timestamp
	marketplaceStat.save()
}

// ===========================
// 🛠️ Helper Functions
// ===========================

function getOrCreateUser(address: Bytes, timestamp: BigInt): User {
	let user = User.load(address.toHexString())
	if (user == null) {
		user = new User(address.toHexString())
		user.address = address
		user.totalListings = ZERO_BI
		user.totalPurchases = ZERO_BI
		user.totalSales = ZERO_BI
		user.totalVolumeAsBuyer = ZERO_BI
		user.totalVolumeAsSeller = ZERO_BI
		user.firstActivityAt = timestamp
		user.lastActivityAt = timestamp

		// Update marketplace total users
		let marketplaceStat = getOrCreateMarketplaceStat()
		marketplaceStat.totalUsers = marketplaceStat.totalUsers.plus(ONE_BI)
		marketplaceStat.save()
	}
	return user
}

function getOrCreateCollection(address: Address): Collection {
	let collection = Collection.load(address.toHexString())
	if (collection == null) {
		collection = new Collection(address.toHexString())
		collection.address = address
		collection.totalListings = ZERO_BI
		collection.totalSales = ZERO_BI
		collection.totalVolume = ZERO_BI
		collection.floorPrice = ZERO_BI
		collection.lastSalePrice = ZERO_BI

		// Update marketplace total collections
		let marketplaceStat = getOrCreateMarketplaceStat()
		marketplaceStat.totalCollections = marketplaceStat.totalCollections.plus(ONE_BI)
		marketplaceStat.save()
	}
	return collection
}

function getOrCreateMarketplaceStat(): MarketplaceStat {
	let marketplaceStat = MarketplaceStat.load(MARKETPLACE_STAT_ID)
	if (marketplaceStat == null) {
		marketplaceStat = new MarketplaceStat(MARKETPLACE_STAT_ID)
		marketplaceStat.totalListings = ZERO_BI
		marketplaceStat.totalActiveListings = ZERO_BI
		marketplaceStat.totalSales = ZERO_BI
		marketplaceStat.totalVolume = ZERO_BI
		marketplaceStat.averagePrice = ZERO_BI
		marketplaceStat.totalCollections = ZERO_BI
		marketplaceStat.totalUsers = ZERO_BI
		marketplaceStat.updatedAt = ZERO_BI
	}
	return marketplaceStat
}

function findActiveListingForNFT(nftAddress: Address, tokenId: BigInt): Listing | null {
	// Simple approach to find active listing
	// In production, you might want to maintain a better mapping
	let listings = new Array<string>()

	// This is a simplified implementation
	// The Graph doesn't support complex queries in mappings
	// For better implementation, consider indexing active listings separately

	return null
} 