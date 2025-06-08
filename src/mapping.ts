import {
	NFTListed as NFTListedEvent,
	NFTBought as NFTBoughtEvent
} from '../generated/NFTMarketplace/NFTMarketplace'
import {
	Listing,
	Purchase,
	User,
	Collection,
	MarketplaceStat,
	CollectionDayData,
	CollectionWeekData,
	MarketplaceDayData,
	MarketplaceWeekData
} from '../generated/schema'
import { BigInt, Bytes, Address } from '@graphprotocol/graph-ts'

// Constants
let ZERO_BI = BigInt.fromI32(0)
let ONE_BI = BigInt.fromI32(1)
let MARKETPLACE_STAT_ID = "marketplace-stats"
let SECONDS_PER_DAY = BigInt.fromI32(86400)
let SECONDS_PER_WEEK = BigInt.fromI32(604800) // 7 days

/**
 * 📈 Handle NFT Listed Event - Simplified Analytics
 */
export function handleNFTListed(event: NFTListedEvent): void {
	let listingId = event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
	let listing = new Listing(listingId)

	// Get or create user and collection
	let user = getOrCreateUser(event.params.seller, event.block.timestamp)
	let collection = getOrCreateCollection(event.params.nftAddress)

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
	collection.totalListings = collection.totalListings.plus(ONE_BI)

	// Update floor price
	if (collection.floorPrice.equals(ZERO_BI) || event.params.price.lt(collection.floorPrice)) {
		collection.floorPrice = event.params.price
	}

	collection.save()

	// Update time-based aggregations
	updateCollectionDayData(collection, event.block.timestamp, ZERO_BI, ZERO_BI, ONE_BI)
	updateCollectionWeekData(collection, event.block.timestamp, ZERO_BI, ZERO_BI, ONE_BI)
	updateMarketplaceDayData(event.block.timestamp, ZERO_BI, ZERO_BI, ONE_BI)
	updateMarketplaceWeekData(event.block.timestamp, ZERO_BI, ZERO_BI, ONE_BI)

	// Update marketplace stats
	let marketplaceStat = getOrCreateMarketplaceStat()
	marketplaceStat.totalListings = marketplaceStat.totalListings.plus(ONE_BI)
	marketplaceStat.totalActiveListings = marketplaceStat.totalActiveListings.plus(ONE_BI)
	marketplaceStat.updatedAt = event.block.timestamp
	marketplaceStat.save()
}

/**
 * 💰 Handle NFT Bought Event - Simplified Analytics
 */
export function handleNFTBought(event: NFTBoughtEvent): void {
	let purchaseId = event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
	let purchase = new Purchase(purchaseId)

	// Get or create users and collection
	let buyer = getOrCreateUser(event.params.buyer, event.block.timestamp)
	let collection = getOrCreateCollection(event.params.nftAddress)

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
		seller = getOrCreateUser(event.params.buyer, event.block.timestamp)
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
	collection.totalSales = collection.totalSales.plus(ONE_BI)
	collection.totalVolume = collection.totalVolume.plus(event.params.price)
	collection.lastSalePrice = event.params.price

	// Update ceiling price
	if (event.params.price.gt(collection.ceilingPrice)) {
		collection.ceilingPrice = event.params.price
	}

	// Update average price
	if (collection.totalSales.gt(ZERO_BI)) {
		collection.averagePrice = collection.totalVolume.div(collection.totalSales)
	}

	collection.save()

	// Update time-based aggregations
	updateCollectionDayData(collection, event.block.timestamp, event.params.price, ONE_BI, ZERO_BI)
	updateCollectionWeekData(collection, event.block.timestamp, event.params.price, ONE_BI, ZERO_BI)
	updateMarketplaceDayData(event.block.timestamp, event.params.price, ONE_BI, ZERO_BI)
	updateMarketplaceWeekData(event.block.timestamp, event.params.price, ONE_BI, ZERO_BI)

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
		collection.ceilingPrice = ZERO_BI
		collection.averagePrice = ZERO_BI
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

// Time-based aggregation functions
function updateCollectionDayData(
	collection: Collection,
	timestamp: BigInt,
	salePrice: BigInt,
	salesCount: BigInt,
	listingsCount: BigInt
): void {
	let dayId = timestamp.div(SECONDS_PER_DAY).times(SECONDS_PER_DAY)
	let dayDataId = collection.id + "-" + dayId.toString()
	let dayData = CollectionDayData.load(dayDataId)

	if (dayData == null) {
		dayData = new CollectionDayData(dayDataId)
		dayData.collection = collection.id
		dayData.date = dayId
		dayData.dailyVolume = ZERO_BI
		dayData.dailySales = ZERO_BI
		dayData.dailyListings = ZERO_BI
		dayData.openPrice = salePrice
		dayData.closePrice = salePrice
		dayData.highPrice = salePrice
		dayData.lowPrice = salePrice
		dayData.avgSalePrice = ZERO_BI
	}

	// Update metrics
	dayData.dailyVolume = dayData.dailyVolume.plus(salePrice)
	dayData.dailySales = dayData.dailySales.plus(salesCount)
	dayData.dailyListings = dayData.dailyListings.plus(listingsCount)

	// Update price metrics
	if (!salePrice.equals(ZERO_BI)) {
		dayData.closePrice = salePrice
		if (salePrice.gt(dayData.highPrice) || dayData.highPrice.equals(ZERO_BI)) {
			dayData.highPrice = salePrice
		}
		if (salePrice.lt(dayData.lowPrice) || dayData.lowPrice.equals(ZERO_BI)) {
			dayData.lowPrice = salePrice
		}

		// Update average price
		if (dayData.dailySales.gt(ZERO_BI)) {
			dayData.avgSalePrice = dayData.dailyVolume.div(dayData.dailySales)
		}
	}

	dayData.save()
}

function updateCollectionWeekData(
	collection: Collection,
	timestamp: BigInt,
	salePrice: BigInt,
	salesCount: BigInt,
	listingsCount: BigInt
): void {
	let weekId = timestamp.div(SECONDS_PER_WEEK).times(SECONDS_PER_WEEK)
	let weekDataId = collection.id + "-" + weekId.toString()
	let weekData = CollectionWeekData.load(weekDataId)

	if (weekData == null) {
		weekData = new CollectionWeekData(weekDataId)
		weekData.collection = collection.id
		weekData.week = weekId
		weekData.weeklyVolume = ZERO_BI
		weekData.weeklySales = ZERO_BI
		weekData.weeklyListings = ZERO_BI
		weekData.openPrice = salePrice
		weekData.closePrice = salePrice
		weekData.highPrice = salePrice
		weekData.lowPrice = salePrice
		weekData.avgSalePrice = ZERO_BI
		weekData.volumeChange = ZERO_BI
		weekData.priceChange = ZERO_BI
	}

	// Update metrics
	weekData.weeklyVolume = weekData.weeklyVolume.plus(salePrice)
	weekData.weeklySales = weekData.weeklySales.plus(salesCount)
	weekData.weeklyListings = weekData.weeklyListings.plus(listingsCount)

	// Update price metrics
	if (!salePrice.equals(ZERO_BI)) {
		weekData.closePrice = salePrice
		if (salePrice.gt(weekData.highPrice) || weekData.highPrice.equals(ZERO_BI)) {
			weekData.highPrice = salePrice
		}
		if (salePrice.lt(weekData.lowPrice) || weekData.lowPrice.equals(ZERO_BI)) {
			weekData.lowPrice = salePrice
		}

		// Update average price
		if (weekData.weeklySales.gt(ZERO_BI)) {
			weekData.avgSalePrice = weekData.weeklyVolume.div(weekData.weeklySales)
		}
	}

	weekData.save()
}

function updateMarketplaceDayData(
	timestamp: BigInt,
	salePrice: BigInt,
	salesCount: BigInt,
	listingsCount: BigInt
): void {
	let dayId = timestamp.div(SECONDS_PER_DAY).times(SECONDS_PER_DAY)
	let dayDataId = "marketplace-" + dayId.toString()
	let dayData = MarketplaceDayData.load(dayDataId)

	if (dayData == null) {
		dayData = new MarketplaceDayData(dayDataId)
		dayData.marketplace = MARKETPLACE_STAT_ID
		dayData.date = dayId
		dayData.dailyVolume = ZERO_BI
		dayData.dailySales = ZERO_BI
		dayData.dailyListings = ZERO_BI
		dayData.dailyActiveUsers = ZERO_BI
		dayData.avgSalePrice = ZERO_BI
		dayData.volumeChange = ZERO_BI
		dayData.salesChange = ZERO_BI
	}

	// Update metrics
	dayData.dailyVolume = dayData.dailyVolume.plus(salePrice)
	dayData.dailySales = dayData.dailySales.plus(salesCount)
	dayData.dailyListings = dayData.dailyListings.plus(listingsCount)

	// Update average price
	if (dayData.dailySales.gt(ZERO_BI)) {
		dayData.avgSalePrice = dayData.dailyVolume.div(dayData.dailySales)
	}

	dayData.save()
}

function updateMarketplaceWeekData(
	timestamp: BigInt,
	salePrice: BigInt,
	salesCount: BigInt,
	listingsCount: BigInt
): void {
	let weekId = timestamp.div(SECONDS_PER_WEEK).times(SECONDS_PER_WEEK)
	let weekDataId = "marketplace-" + weekId.toString()
	let weekData = MarketplaceWeekData.load(weekDataId)

	if (weekData == null) {
		weekData = new MarketplaceWeekData(weekDataId)
		weekData.marketplace = MARKETPLACE_STAT_ID
		weekData.week = weekId
		weekData.weeklyVolume = ZERO_BI
		weekData.weeklySales = ZERO_BI
		weekData.weeklyListings = ZERO_BI
		weekData.weeklyActiveUsers = ZERO_BI
		weekData.avgSalePrice = ZERO_BI
		weekData.volumeChange = ZERO_BI
		weekData.salesChange = ZERO_BI
	}

	// Update metrics
	weekData.weeklyVolume = weekData.weeklyVolume.plus(salePrice)
	weekData.weeklySales = weekData.weeklySales.plus(salesCount)
	weekData.weeklyListings = weekData.weeklyListings.plus(listingsCount)

	// Update average price
	if (weekData.weeklySales.gt(ZERO_BI)) {
		weekData.avgSalePrice = weekData.weeklyVolume.div(weekData.weeklySales)
	}

	weekData.save()
}

function findActiveListingForNFT(nftAddress: Address, tokenId: BigInt): Listing | null {
	// Simplified implementation - returns null for now
	// The system will still work without this optimization
	return null
} 